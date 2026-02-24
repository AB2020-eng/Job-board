import express from 'express'
import bodyParser from 'body-parser'
import multer from 'multer'
import crypto from 'crypto'
import { Telegraf, Markup } from 'telegraf'
import { GoogleSpreadsheet } from 'google-spreadsheet'
import { GoogleAuth } from 'google-auth-library'

const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ADMIN_ID,
  TELEGRAM_CHANNEL_ID,
  TELEGRAM_BOT_USERNAME,
  BOT_PUBLIC_URL,
  BOT_WEBHOOK_SECRET,
  GOOGLE_SHEETS_ID,
  GOOGLE_SPREADSHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  GOOGLE_PRIVATE_KEY
} = process.env

const EFFECTIVE_CHANNEL_ID = (TELEGRAM_CHANNEL_ID && TELEGRAM_CHANNEL_ID.trim()) || '-1003779130300'

const bot = new Telegraf(TELEGRAM_BOT_TOKEN as string)
const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

function normalizeSpreadsheetId(input?: string) {
  if (!input) return undefined
  const s = input.trim().replace(/^`|`$/g, '')
  if (s.includes('/spreadsheets/d/')) {
    const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return m?.[1] || undefined
  }
  return s
}

async function getSheets() {
  const sheetId = normalizeSpreadsheetId(GOOGLE_SPREADSHEET_ID || GOOGLE_SHEETS_ID)
  if (!sheetId) throw new Error('Missing GOOGLE_SPREADSHEET_ID')
  const auth = new GoogleAuth({
    credentials: {
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL as string,
      private_key: ((GOOGLE_PRIVATE_KEY || GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) as string).replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
  const doc = new GoogleSpreadsheet(sheetId as string, auth as any)
  await doc.loadInfo()
  const jobs = doc.sheetsByTitle['Jobs']
  const applications = doc.sheetsByTitle['Applications']
  return { doc, jobs, applications }
}

function verifyInitData(initData: string) {
  try {
    const urlParams = new URLSearchParams(initData)
    const hash = urlParams.get('hash') || ''
    urlParams.delete('hash')
    const pairs: string[] = []
    Array.from(urlParams.keys())
      .sort()
      .forEach((k) => {
        const v = urlParams.get(k)
        if (v !== null) pairs.push(`${k}=${v}`)
      })
    const dataCheckString = pairs.join('\n')
    const secret = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN as string).digest()
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
    return hmac === hash
  } catch {
    return false
  }
}

function deepLinkForJob(jobId: number | string) {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}/app?startapp=jobId_${jobId}.`
}

async function notifyAdminForJob(job: any) {
  const text = `New Job: ${job.title} by @${job.employer_username || 'unknown'}\n${String(job.description || '').slice(0, 200)}`
  const approveData = `approve:${job.id}`
  const rejectData = `reject:${job.id}`
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Approve', approveData), Markup.button.callback('❌ Reject', rejectData)]
  ])
  await bot.telegram.sendMessage(Number(TELEGRAM_ADMIN_ID), text, keyboard)
}

bot.on('callback_query', async (ctx) => {
  const fromId = ctx.from?.id
  if (String(fromId) !== String(TELEGRAM_ADMIN_ID)) {
    return ctx.answerCbQuery('Not allowed')
  }
  const data = (ctx.callbackQuery as any)?.data || ''
  const [action, idStr] = data.split(':')
  const jobId = String(idStr || '').replace(/[^0-9]/g, '')
  if (!jobId) return ctx.answerCbQuery('Invalid')
  if (action === 'approve') {
    const { jobs } = await getSheets()
    const rows = await jobs.getRows()
    const row = rows.find((r: any) => String((r as any).ID) === String(jobId)) as any
    if (!row) return ctx.answerCbQuery('Not found')
    ;(row as any).Status = 'active'
    await row.save()
    const link = deepLinkForJob(jobId)
    const postText = `💼 ${(row as any).Title}\n${(row as any).Description}\n\nApply via Mini App`
    const keyboard = {
      reply_markup: {
        inline_keyboard: [[{ text: '💼 Apply via Mini App', url: link }]]
      }
    }
    await bot.telegram.sendMessage(String(EFFECTIVE_CHANNEL_ID), postText, keyboard)
    await ctx.answerCbQuery('Approved')
  } else if (action === 'reject') {
    const { jobs } = await getSheets()
    const rows = await jobs.getRows()
    const row = rows.find((r: any) => String((r as any).ID) === String(jobId)) as any
    if (!row) return ctx.answerCbQuery('Not found')
    ;(row as any).Status = 'rejected'
    await row.save()
    await ctx.answerCbQuery('Rejected')
  } else {
    await ctx.answerCbQuery('Unknown')
  }
})

app.use(bodyParser.json({ limit: '2mb' }))

app.get('/health', (_req: any, res: any) => res.send('ok'))

app.post('/jobs', async (req: any, res: any) => {
  const { title, description, employer_id, employer_username, tg_init_data } = req.body || {}
  if (!verifyInitData(String(tg_init_data || ''))) return res.status(400).json({ error: 'invalid_init_data' })
  try {
    const { jobs } = await getSheets()
    const id = Date.now()
    const now = new Date()
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    await jobs.addRow({
      ID: String(id),
      Employer: String(employer_id || ''),
      Title: title,
      Description: description,
      Status: 'pending',
      Created_At: now.toISOString(),
      Expires_At: expires.toISOString()
    })
    await notifyAdminForJob({ id, title, description, employer_username })
    res.json({ ok: true, id })
  } catch (e: any) {
    res.status(500).json({ error: (e as any).message || 'sheet_error' })
  }
})

app.get('/jobs/:id', async (req: any, res: any) => {
  const id = String(req.params.id || '').replace(/[^0-9]/g, '')
  try {
    const { jobs } = await getSheets()
    const rows = await jobs.getRows()
    const row = rows.find((r: any) => String((r as any).ID) === id && String((r as any).Status).toLowerCase() === 'active') as any
    if (!row) return res.status(404).json({ error: 'not_found' })
    res.json({
      id,
      title: (row as any).Title,
      description: (row as any).Description,
      status: (row as any).Status,
      createdAt: (row as any).Created_At,
      expiresAt: (row as any).Expires_At,
      employer: (row as any).Employer
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'sheet_error' })
  }
})

app.post('/applications', upload.single('file'), async (req: any, res: any) => {
  const { job_id, tg_init_data } = req.body as { job_id: string; tg_init_data: string }
  if (!verifyInitData(String(tg_init_data || ''))) return res.status(400).json({ error: 'invalid_init_data' })
  const file = (req as any).file as any
  if (!file) return res.status(400).json({ error: 'missing_file' })
  const init = new URLSearchParams(tg_init_data)
  const userStr = init.get('user') || ''
  const user = userStr ? JSON.parse(userStr) : undefined
  const seekerUsername = user?.username
  const jobId = String(job_id || '').replace(/[^0-9]/g, '')
  if (!jobId) return res.status(400).json({ error: 'bad_request' })
  try {
    const { jobs, applications } = await getSheets()
    const rows = await jobs.getRows()
    const row = rows.find((r: any) => String((r as any).ID) === jobId) as any
    if (!row) return res.status(404).json({ error: 'job_not_found' })
    const employerId = (row as any).Employer
    const caption = `New applicant for ${(row as any).Title}\nContact: @${seekerUsername || 'unknown'}`
    const sent = await bot.telegram.sendDocument(Number(employerId), { source: file.buffer, filename: file.originalname }, { caption })
    const fileId = (sent as any)?.document?.file_id || ''
    await applications.addRow({
      Job_ID: String(jobId),
      Seeker_Username: seekerUsername || '',
      CV_File_ID: fileId,
      Applied_At: new Date().toISOString()
    })
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'sheet_error' })
  }
})

if (BOT_PUBLIC_URL) {
  const webhookPath = `/telegram/webhook/${BOT_WEBHOOK_SECRET || ''}`
  const webhookUrl = `${BOT_PUBLIC_URL}${webhookPath}`
  bot.telegram.setWebhook(webhookUrl)
  app.use(bot.webhookCallback(webhookPath))
}

const port = process.env.PORT || 8080
app.listen(port, () => {
  console.log(`bot server on ${port}`)
})

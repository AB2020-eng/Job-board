import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import { getSheets } from '../../server/sheets'
import { verifyInitData } from '../../server/verify'
import { bot } from '../../server/bot'

export const config = { api: { bodyParser: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const form = formidable({})
  const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (err: any, fields: formidable.Fields, files: formidable.Files) => {
      if (err) reject(err)
      else resolve({ fields, files })
    })
  })
  const tgInit = String(fields.tg_init_data || '')
  const ok = verifyInitData(tgInit, process.env.TELEGRAM_BOT_TOKEN as string)
  if (!ok) return res.status(400).json({ error: 'invalid_init_data' })
  const jobId = String(fields.job_id || '').replace(/[^0-9]/g, '')
  if (!jobId) return res.status(400).json({ error: 'bad_request' })
  const uploaded = (files as formidable.Files)['file'] as formidable.File | formidable.File[] | undefined
  const f = Array.isArray(uploaded) ? uploaded[0] : uploaded
  if (!f || !(f as formidable.File).filepath) return res.status(400).json({ error: 'missing_file' })
  const init = new URLSearchParams(tgInit)
  const userStr = init.get('user') || ''
  const user = userStr ? JSON.parse(userStr) : undefined
  const seekerUsername = user?.username
  try {
    const { jobs, applications } = await getSheets()
    const rows = await jobs.getRows()
    const row = rows.find((r: any) => String((r as any).ID) === jobId) as any
    if (!row) return res.status(404).json({ error: 'job_not_found' })
    const employerId = (row as any).Employer
    const caption = `New applicant for ${(row as any).Title}\nContact: @${seekerUsername || 'unknown'}`
    const sent = await bot.telegram.sendDocument(Number(employerId), { source: f.filepath, filename: f.originalFilename || 'cv' }, { caption })
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
}

import type { NextApiRequest, NextApiResponse } from 'next'
import { verifyInitData } from '../../../server/verify'
import { getSheets } from '../../../server/sheets'
import { notifyAdmin } from '../../../server/bot'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { title, description, employer_id, employer_username, tg_init_data } = req.body || {}
  const token = process.env.TELEGRAM_BOT_TOKEN as string | undefined
  const allowUnverified = String(process.env.ALLOW_UNVERIFIED_POSTS ?? 'true').toLowerCase() === 'true'
  const initDataStr = String(tg_init_data || '')
  const shouldVerify = Boolean(token && initDataStr)
  const ok = shouldVerify ? verifyInitData(initDataStr, token as string) : false
  if (shouldVerify && !ok && !allowUnverified) {
    return res.status(400).json({ error: 'invalid_init_data' })
  }
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || (!process.env.GOOGLE_SPREADSHEET_ID && !process.env.GOOGLE_SHEETS_ID)) {
    return res.status(500).json({ error: 'missing_env', details: 'Google Sheets credentials or Spreadsheet ID not configured' })
  }
  try {
    const { jobs } = await getSheets()
    await jobs.loadHeaderRow()
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
    await notifyAdmin({ id, title, description, employer_username })
    res.json({ ok: true, id })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'sheet_error' })
  }
}

import type { NextApiRequest, NextApiResponse } from 'next'
import { bot } from '../../../server/bot'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  const secret = req.query.secret
  if (String(secret || '') !== String(process.env.BOT_WEBHOOK_SECRET || '')) {
    return res.status(403).end()
  }
  const base = (process.env.BOT_PUBLIC_URL || '').replace(/\/+$/, '')
  if (!base) return res.status(400).json({ error: 'missing_PUBLIC_URL' })
  const url = `${base}/api/telegram/webhook/${process.env.BOT_WEBHOOK_SECRET || ''}`
  await bot.telegram.setWebhook(url)
  res.json({ ok: true, url })
}

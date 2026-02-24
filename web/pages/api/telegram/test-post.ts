import type { NextApiRequest, NextApiResponse } from 'next'
import { bot } from '../../../server/bot'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()
  const secret = req.query.secret
  if (String(secret || '') !== String(process.env.BOT_WEBHOOK_SECRET || '')) {
    return res.status(403).json({ error: 'forbidden' })
  }
  const channel = String(process.env.TELEGRAM_CHANNEL_ID || '-1003779130300')
  const text = String(req.query.text || req.body?.text || 'Test post from /api/telegram/test-post')
  try {
    const sent = await bot.telegram.sendMessage(channel as any, text as any)
    res.json({ ok: true, channel, message_id: (sent as any)?.message_id })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.response?.description || e?.message || 'send_failed', channel })
  }
}

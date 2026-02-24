import type { NextApiRequest, NextApiResponse } from 'next'
import { bot } from '../../../server/bot'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end()
  const secret = req.query.secret
  if (String(secret || '') !== String(process.env.BOT_WEBHOOK_SECRET || '')) {
    return res.status(403).end()
  }
  const baseOverride = typeof req.query.base === 'string' ? req.query.base : undefined
  const baseSrc = baseOverride || process.env.BOT_PUBLIC_URL || ''
  const base = baseSrc.replace(/\/+$/, '')
  if (!base) return res.status(400).json({ error: 'missing_PUBLIC_URL' })
  try {
    const u = new URL(base)
    const host = u.hostname.toLowerCase()
    if (host.includes('telegram.org') || host === 't.me') {
      return res.status(400).json({ error: 'invalid_PUBLIC_URL', details: 'Use your Vercel domain, not telegram.org/t.me' })
    }
  } catch {
    return res.status(400).json({ error: 'invalid_PUBLIC_URL' })
  }
  const url = `${base}/api/bot`
  await bot.telegram.setWebhook(url, {
    secret_token: String(process.env.BOT_WEBHOOK_SECRET || ''),
    allowed_updates: ['callback_query', 'message'],
    drop_pending_updates: false
  } as any)
  const info = await bot.telegram.getWebhookInfo()
  res.json({ ok: true, url, info })
}

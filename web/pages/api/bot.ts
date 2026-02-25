import type { NextApiRequest, NextApiResponse } from 'next'
import { bot } from '../../server/bot'

export const config = { api: { bodyParser: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const headerKey = 'x-telegram-bot-api-secret-token'
  const headerVal = (req.headers[headerKey] || req.headers[headerKey.toUpperCase()]) as string | string[] | undefined
  const token = Array.isArray(headerVal) ? headerVal[0] : headerVal
  if (!token || token !== String(process.env.BOT_WEBHOOK_SECRET || '')) {
    res.status(403).end()
    return
  }
  const handler = bot.webhookCallback('/api/bot') as any
  await handler(req, res)
  if (!res.headersSent) {
    res.status(200).send('OK')
  }
}

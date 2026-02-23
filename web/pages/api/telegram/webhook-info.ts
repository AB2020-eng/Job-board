import type { NextApiRequest, NextApiResponse } from 'next'
import { bot } from '../../../server/bot'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  try {
    const info = await bot.telegram.getWebhookInfo()
    res.json(info)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed_to_get_webhook_info' })
  }
}

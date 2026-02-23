import type { NextApiRequest, NextApiResponse } from 'next'
import webhook from '../../../../server/bot'

export const config = { api: { bodyParser: false } }

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = req.query.secret
  if (String(secret || '') !== String(process.env.BOT_WEBHOOK_SECRET || '')) {
    return res.status(403).end()
  }
  return webhook(req, res)
}

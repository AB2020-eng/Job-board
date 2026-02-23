import type { NextApiRequest, NextApiResponse } from 'next'
import { getSheets } from '../../../server/sheets'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const id = String(req.query.id || '').replace(/[^0-9]/g, '')
  try {
    const { jobs } = await getSheets()
    await jobs.loadHeaderRow()
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
}

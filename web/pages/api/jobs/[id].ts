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
    const payload = {
      ID: String((row as any).ID),
      Employer: (row as any).Employer,
      Title: (row as any).Title,
      Description: (row as any).Description,
      Status: (row as any).Status,
      Created_At: (row as any).Created_At,
      Expires_At: (row as any).Expires_At
    }
    res.json({
      ...payload,
      // Back-compat camelCase fields for UI that still expects them
      id: payload.ID,
      employer: payload.Employer,
      title: payload.Title,
      description: payload.Description,
      status: payload.Status,
      createdAt: payload.Created_At,
      expiresAt: payload.Expires_At
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'sheet_error' })
  }
}

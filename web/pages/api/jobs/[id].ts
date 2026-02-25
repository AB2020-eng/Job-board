import type { NextApiRequest, NextApiResponse } from 'next'
import { getJobById } from '../../../server/sheets'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const id = String(req.query.id || '').replace(/[^0-9]/g, '')
  try {
    const payload = await getJobById(id)
    res.json({
      ...payload,
      // Back-compat camelCase fields for UI that still expects them
      id: payload.ID,
      employer: payload.Employer,
      title: payload.Title,
      category: payload.Category,
      salary: payload.Salary,
      description: payload.Description,
      status: payload.Status,
      createdAt: payload.Created_At,
      expiresAt: payload.Expires_At
    })
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'sheet_error' })
  }
}

import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet'
import { GoogleAuth } from 'google-auth-library'

function normalizeSpreadsheetId(input?: string) {
  if (!input) return undefined
  const s = input.trim().replace(/^`|`$/g, '')
  if (s.includes('/spreadsheets/d/')) {
    const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return m?.[1] || undefined
  }
  return s
}

export const JOBS_HEADERS = ['ID', 'Employer', 'Title', 'Description', 'Status', 'Created_At', 'Expires_At']
export const APPLICATIONS_HEADERS = ['Job_ID', 'Seeker_Username', 'CV_File_ID', 'Applied_At']

export async function getSheets() {
  const id = normalizeSpreadsheetId(process.env.GOOGLE_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID)
  if (!id) throw new Error('Missing spreadsheet id')
  const auth = new GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL as string,
      private_key: ((process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) as string).replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
  const doc = new GoogleSpreadsheet(id, auth as any)
  await doc.loadInfo()
  let jobs: GoogleSpreadsheetWorksheet | undefined = doc.sheetsByTitle['Jobs']
  let applications: GoogleSpreadsheetWorksheet | undefined = doc.sheetsByTitle['Applications']
  if (!jobs) {
    jobs = await doc.addSheet({
      title: 'Jobs',
      headerValues: JOBS_HEADERS
    })
  }
  if (!applications) {
    applications = await doc.addSheet({
      title: 'Applications',
      headerValues: APPLICATIONS_HEADERS
    })
  }
  // Ensure headers exist on existing sheets where header row may be empty
  const ensureHeaders = async (ws: GoogleSpreadsheetWorksheet, headers: string[]) => {
    try {
      await ws.loadHeaderRow()
    } catch {}
    const current: string[] = Array.isArray((ws as any).headerValues) ? (ws as any).headerValues : []
    const hasAny = current.length > 0 && !current.every((h: any) => !h)
    if (!hasAny) {
      await ws.setHeaderRow(headers)
      await ws.loadHeaderRow()
    } else {
      // Ensure all expected headers exist; if missing, update header row with union
      const missing = headers.filter((h) => !current.includes(h))
      if (missing.length) {
        const union = Array.from(new Set([...current, ...headers]))
        await ws.setHeaderRow(union)
      }
      await ws.loadHeaderRow()
    }
  }
  await ensureHeaders(jobs, JOBS_HEADERS)
  await ensureHeaders(applications, APPLICATIONS_HEADERS)
  return { doc, jobs, applications }
}

export async function addJobRow(record: {
  ID: string
  Employer: string
  Title: string
  Description: string
  Status: string
  Created_At: string
  Expires_At: string
}) {
  const { jobs } = await getSheets()
  await jobs.loadHeaderRow()
  try {
    await jobs.addRow(record as any)
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('Header values are not yet loaded') || msg.includes('No values in the header row')) {
      await jobs.setHeaderRow(JOBS_HEADERS)
      await jobs.loadHeaderRow()
      await jobs.addRow(record as any)
    } else {
      throw err
    }
  }
}

export async function updateJobStatus(jobId: string, status: string) {
  const { jobs } = await getSheets()
  const idSan = String(jobId || '').replace(/[^0-9]/g, '')
  try {
    await jobs.loadHeaderRow()
  } catch {}
  let rows: any[] = []
  try {
    rows = await jobs.getRows()
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('Header values are not yet loaded') || msg.includes('Header values are not loaded') || msg.includes('No values in the header row')) {
      await jobs.setHeaderRow(JOBS_HEADERS)
      await jobs.loadHeaderRow()
      rows = await jobs.getRows()
    } else {
      throw err
    }
  }
  const headers: string[] = ((jobs as any).headerValues || []) as any
  const norm = (s: string) => String(s || '').toLowerCase()
  const findKey = (cands: string[]) => headers.find((h) => cands.map(norm).includes(norm(h)))
  const idKey = findKey(['ID', 'Id', 'id', 'Job_ID', 'Job Id', 'JobId']) || 'ID'
  const statusKey = findKey(['Status', 'status', 'State']) || 'Status'
  let row = rows.find((r: any) => String((r as any)[idKey]) === idSan) as any
  if (!row) {
    for (let i = 0; i < 3 && !row; i++) {
      await new Promise((r) => setTimeout(r, 250))
      await jobs.loadHeaderRow()
      rows = await jobs.getRows()
      row = rows.find((r: any) => String((r as any)[idKey]) === idSan) as any
    }
  }
  if (!row) throw new Error('not_found')
  row[statusKey] = status
  await row.save()
  return row
}

export async function getJobById(jobId: string) {
  const { jobs } = await getSheets()
  const idSan = String(jobId || '').replace(/[^0-9]/g, '')
  try {
    await jobs.loadHeaderRow()
  } catch {}
  let rows: any[] = []
  try {
    rows = await jobs.getRows()
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('Header values are not yet loaded') || msg.includes('Header values are not loaded') || msg.includes('No values in the header row')) {
      await jobs.setHeaderRow(JOBS_HEADERS)
      await jobs.loadHeaderRow()
      rows = await jobs.getRows()
    } else {
      throw err
    }
  }
  const headers: string[] = ((jobs as any).headerValues || []) as any
  const norm = (s: string) => String(s || '').toLowerCase()
  const findKey = (cands: string[]) => headers.find((h) => cands.map(norm).includes(norm(h)))
  const idKey = findKey(['ID', 'Id', 'id', 'Job_ID', 'Job Id', 'JobId']) || 'ID'
  const titleKey = findKey(['Title', 'title']) || 'Title'
  const descKey = findKey(['Description', 'description']) || 'Description'
  const employerKey = findKey(['Employer', 'employer', 'Employer_ID', 'EmployerId']) || 'Employer'
  const statusKey = findKey(['Status', 'status', 'State']) || 'Status'
  const createdKey = findKey(['Created_At', 'created_at', 'CreatedAt', 'createdAt']) || 'Created_At'
  const expiresKey = findKey(['Expires_At', 'expires_at', 'ExpiresAt', 'expiresAt']) || 'Expires_At'
  let row = rows.find((r: any) => String((r as any)[idKey]) === idSan) as any
  if (!row) {
    for (let i = 0; i < 3 && !row; i++) {
      await new Promise((r) => setTimeout(r, 250))
      await jobs.loadHeaderRow()
      rows = await jobs.getRows()
      row = rows.find((r: any) => String((r as any)[idKey]) === idSan) as any
    }
  }
  if (!row) throw new Error('not_found')
  return {
    ID: String(row[idKey]),
    Employer: row[employerKey],
    Title: row[titleKey],
    Description: row[descKey],
    Status: row[statusKey],
    Created_At: row[createdKey],
    Expires_At: row[expiresKey]
  }
}

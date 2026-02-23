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

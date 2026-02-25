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

export const JOBS_HEADERS = ['ID', 'Employer', 'Title', 'Category', 'Salary', 'Description', 'Created_At', 'Expires_At']
export const APPLICATIONS_HEADERS = ['Job_ID', 'Seeker_Username', 'CV_File_ID', 'Applied_At']

export async function getSheets() {
  const id = normalizeSpreadsheetId(process.env.GOOGLE_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID)
  if (!id) throw new Error('Missing spreadsheet id')
  const json = process.env.GOOGLE_CREDENTIALS_JSON
  let client_email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL as string | undefined
  let private_key = process.env.GOOGLE_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ''
  if (json) {
    try {
      const parsed = JSON.parse(json)
      client_email = parsed.client_email || client_email
      private_key = parsed.private_key || private_key
    } catch {}
  }
  if (!client_email) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL')
  const strip = (s: string) => s.replace(/^\s+|\s+$/g, '').replace(/^['"`]+|['"`]+$/g, '')
  let key = strip(String(private_key || ''))
  if (key.includes('\\n')) key = key.replace(/\\n/g, '\n')
  if (!key.includes('BEGIN') && /^[A-Za-z0-9+/=]+$/.test(key)) {
    try { key = Buffer.from(key, 'base64').toString('utf8') } catch {}
  }
  if (!key.includes('BEGIN') || !key.includes('END')) throw new Error('invalid_private_key_format')
  const auth = new GoogleAuth({
    credentials: { client_email: client_email as string, private_key: key },
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
  Category?: string
  Salary?: string
  Description: string
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

async function findRowByIdWithCells(jobs: GoogleSpreadsheetWorksheet, equalId: (val: any) => boolean) {
  await jobs.loadCells()
  const headerRowIndex = (jobs as any).headerRowIndex ?? 0
  const rowCount = Number((jobs as any).rowCount || 0)
  const columnCount = Number((jobs as any).columnCount || 0)
  for (let r = headerRowIndex + 1; r < rowCount; r++) {
    for (let c = 0; c < columnCount; c++) {
      const cell = jobs.getCell(r, c)
      if (equalId(cell?.value)) {
        return r
      }
    }
  }
  return -1
}

function buildRowFromCells(jobs: GoogleSpreadsheetWorksheet, rowIndex: number, headers: string[]) {
  const result: Record<string, any> = {}
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i]
    if (!key) continue
    result[key] = jobs.getCell(rowIndex, i)?.value
  }
  return result
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
  const norm = (s: string) => String(s || '').trim().toLowerCase()
  const findKey = (cands: string[]) => headers.find((h) => cands.map(norm).includes(norm(h)))
  const idKey = findKey(['ID', 'Id', 'id', 'Job_ID', 'Job Id', 'JobId']) || 'ID'
  const statusKey = findKey(['Status', 'status', 'State']) || 'Status'
  const equalId = (val: any) => {
    const raw = String(val ?? '')
    if (raw === idSan) return true
    const digits = raw.replace(/\D/g, '')
    if (digits && digits === idSan) return true
    const n = Number(raw)
    if (Number.isFinite(n) && String(Math.trunc(n)) === idSan) return true
    return false
  }
  const matchesRow = (r: any) => {
    if (equalId((r as any)[idKey])) return true
    const raw = Array.isArray((r as any)._rawData) ? (r as any)._rawData : []
    return raw.some((v: any) => equalId(v))
  }
  let row = rows.find((r: any) => matchesRow(r)) as any
  if (!row) {
    for (let i = 0; i < 12 && !row; i++) {
      await new Promise((r) => setTimeout(r, 250))
      await jobs.loadHeaderRow()
      rows = await jobs.getRows()
      row = rows.find((r: any) => matchesRow(r)) as any
    }
  }
  if (!row) {
    const rowIndex = await findRowByIdWithCells(jobs, equalId)
    if (rowIndex >= 0) {
      const statusIdx = headers.findIndex((h) => norm(h) === norm(statusKey))
      if (statusIdx >= 0) {
        const statusCell = jobs.getCell(rowIndex, statusIdx)
        statusCell.value = status
        await jobs.saveUpdatedCells()
      }
      const built = buildRowFromCells(jobs, rowIndex, headers)
      built[statusKey] = status
      return built
    }
    throw new Error('not_found')
  }
  const hasStatus = headers.some((h) => norm(h) === norm(statusKey))
  if (hasStatus) {
    row[statusKey] = status
    await row.save()
  }
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
  const norm = (s: string) => String(s || '').trim().toLowerCase()
  const findKey = (cands: string[]) => headers.find((h) => cands.map(norm).includes(norm(h)))
  const idKey = findKey(['ID', 'Id', 'id', 'Job_ID', 'Job Id', 'JobId']) || 'ID'
  const titleKey = findKey(['Title', 'title']) || 'Title'
  const categoryKey = findKey(['Category', 'category']) || 'Category'
  const salaryKey = findKey(['Salary', 'salary']) || 'Salary'
  const descKey = findKey(['Description', 'description']) || 'Description'
  const employerKey = findKey(['Employer', 'employer', 'Employer_ID', 'EmployerId']) || 'Employer'
  const statusKey = findKey(['Status', 'status', 'State']) || 'Status'
  const createdKey = findKey(['Created_At', 'created_at', 'CreatedAt', 'createdAt']) || 'Created_At'
  const expiresKey = findKey(['Expires_At', 'expires_at', 'ExpiresAt', 'expiresAt']) || 'Expires_At'
  const headerIndex = (cands: string[], fallback: number) => {
    const idx = headers.findIndex((h) => cands.map(norm).includes(norm(h)))
    return idx >= 0 ? idx : fallback
  }
  const idxId = headerIndex(['ID', 'Id', 'id', 'Job_ID', 'Job Id', 'JobId'], 0)
  const idxEmployer = headerIndex(['Employer', 'employer', 'Employer_ID', 'EmployerId'], 1)
  const idxTitle = headerIndex(['Title', 'title'], 2)
  const idxCategory = headerIndex(['Category', 'category'], 3)
  const idxSalary = headerIndex(['Salary', 'salary'], 4)
  const idxDesc = headerIndex(['Description', 'description'], 5)
  const idxStatus = headerIndex(['Status', 'status', 'State'], -1)
  const idxCreated = headerIndex(['Created_At', 'created_at', 'CreatedAt', 'createdAt'], 6)
  const idxExpires = headerIndex(['Expires_At', 'expires_at', 'ExpiresAt', 'expiresAt'], 7)
  const equalId2 = (val: any) => {
    const raw = String(val ?? '')
    if (raw === idSan) return true
    const digits = raw.replace(/\D/g, '')
    if (digits && digits === idSan) return true
    const n = Number(raw)
    if (Number.isFinite(n) && String(Math.trunc(n)) === idSan) return true
    return false
  }
  const matchesRow2 = (r: any) => {
    if (equalId2((r as any)[idKey])) return true
    const raw = Array.isArray((r as any)._rawData) ? (r as any)._rawData : []
    return raw.some((v: any) => equalId2(v))
  }
  let row = rows.find((r: any) => matchesRow2(r)) as any
  if (!row) {
    for (let i = 0; i < 40 && !row; i++) {
      await new Promise((r) => setTimeout(r, 250))
      await jobs.loadHeaderRow()
      rows = await jobs.getRows()
      row = rows.find((r: any) => matchesRow2(r)) as any
    }
  }
  if (!row) {
    const rowIndex = await findRowByIdWithCells(jobs, equalId2)
    if (rowIndex >= 0) {
      const getCellVal = (idx: number) => (idx >= 0 ? jobs.getCell(rowIndex, idx)?.value : undefined)
      const built = buildRowFromCells(jobs, rowIndex, headers)
      const pickCell = (key: string, idx: number) => {
        const v = (built as any)[key]
        if (v !== undefined && v !== null && String(v).trim() !== '') return v
        const c = getCellVal(idx)
        if (c !== undefined && c !== null && String(c).trim() !== '') return c
        return v ?? c
      }
      return {
        ID: String(pickCell(idKey, idxId) ?? ''),
        Employer: pickCell(employerKey, idxEmployer),
        Title: pickCell(titleKey, idxTitle),
        Category: pickCell(categoryKey, idxCategory),
        Salary: pickCell(salaryKey, idxSalary),
        Description: pickCell(descKey, idxDesc),
        Status: pickCell(statusKey, idxStatus),
        Created_At: pickCell(createdKey, idxCreated),
        Expires_At: pickCell(expiresKey, idxExpires)
      }
    }
    throw new Error('not_found')
  }
  const raw = Array.isArray((row as any)._rawData) ? (row as any)._rawData : []
  const pickRow = (key: string, idx: number) => {
    const v = (row as any)[key]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
    const r = idx >= 0 ? raw[idx] : undefined
    if (r !== undefined && r !== null && String(r).trim() !== '') return r
    return v ?? r
  }
  return {
    ID: String(pickRow(idKey, idxId)),
    Employer: pickRow(employerKey, idxEmployer),
    Title: pickRow(titleKey, idxTitle),
    Category: pickRow(categoryKey, idxCategory),
    Salary: pickRow(salaryKey, idxSalary),
    Description: pickRow(descKey, idxDesc),
    Status: pickRow(statusKey, idxStatus),
    Created_At: pickRow(createdKey, idxCreated),
    Expires_At: pickRow(expiresKey, idxExpires)
  }
}

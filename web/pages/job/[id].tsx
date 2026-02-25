import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { getInitDataString } from '../../lib/telegram'

export default function JobDetail() {
  const router = useRouter()
  const { id } = router.query
  const [job, setJob] = useState<any>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle'|'uploading'|'done'|'error'>('idle')

  useEffect(() => {
    async function load() {
      if (!id) return
      const idNum = String(id).replace(/[^0-9]/g, '')
      const res = await fetch(`/api/jobs/${idNum}`)
      if (res.ok) {
        const data = await res.json()
        setJob(data)
      }
    }
    load()
  }, [id])

  async function onApply() {
    if (!file || !job) return
    setStatus('uploading')
    const form = new FormData()
    form.append('job_id', String(job.id))
    form.append('file', file)
    const initData = getInitDataString()
    form.append('tg_init_data', initData || '')
    try {
      const res = await fetch(`/api/applications`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Failed to apply')
      setStatus('done')
    } catch (e) {
      setStatus('error')
    }
  }

  if (!job) return <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>Loading...</div>

  const expiresStr = job?.Expires_At ?? job?.expiresAt
  const isExpired = Boolean(expiresStr && new Date(expiresStr) < new Date())
  const title = job.Title || job.title
  const description = job.Description || job.description
  const category = job.Category || job.category
  const salary = job.Salary || job.salary
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(15,23,42,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 26, color: '#0f172a' }}>{title} {isExpired ? '🚫 EXPIRED' : ''}</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {category ? <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{category}</span> : null}
              {salary ? <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{salary}</span> : null}
            </div>
          </div>
          <p style={{ marginTop: 12, marginBottom: 0, color: '#334155', lineHeight: 1.6 }}>{description}</p>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 24, boxShadow: '0 10px 30px rgba(15,23,42,0.08)', display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>Apply with your CV</div>
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            onChange={e=>setFile(e.target.files?.[0]||null)}
            style={{ padding: 10, border: '1px solid #e2e8f0', borderRadius: 10 }}
          />
          <button
            onClick={onApply}
            disabled={!file || status==='uploading' || isExpired}
            style={{
              background: !file || status==='uploading' || isExpired ? '#94a3b8' : '#2563eb',
              color: 'white',
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              fontWeight: 600,
              cursor: !file || status==='uploading' || isExpired ? 'not-allowed' : 'pointer'
            }}
          >
            {status === 'uploading' ? 'Sending...' : 'Apply Now'}
          </button>
          {status==='done' ? <div style={{ color: '#0f766e', fontWeight: 600 }}>Application sent</div> : null}
          {status==='error' ? <div style={{ color: '#dc2626', fontWeight: 600 }}>Failed</div> : null}
        </div>
      </div>
    </div>
  )
}

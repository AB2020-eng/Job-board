import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

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
    const initData = typeof window !== 'undefined' ? window.Telegram?.WebApp?.initData : ''
    form.append('tg_init_data', initData || '')
    try {
      const res = await fetch(`/api/applications`, { method: 'POST', body: form })
      if (!res.ok) throw new Error('Failed to apply')
      setStatus('done')
    } catch (e) {
      setStatus('error')
    }
  }

  if (!job) return <div>Loading...</div>

  const isExpired = job?.expiresAt && new Date(job.expiresAt) < new Date()
  return (
    <div style={{ padding: 12, display: 'grid', gap: 8 }}>
      <h2>{job.title} {isExpired ? '🚫 EXPIRED' : ''}</h2>
      <p>{job.description}</p>
      <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" onChange={e=>setFile(e.target.files?.[0]||null)} />
      <button onClick={onApply} disabled={!file || status==='uploading' || isExpired}>Apply</button>
      {status==='done' ? <div>Application sent</div> : null}
      {status==='error' ? <div>Failed</div> : null}
    </div>
  )
}

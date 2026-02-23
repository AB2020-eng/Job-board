import { useState } from 'react'
import { getUser, getInitDataString } from '../lib/telegram'

export default function EmployerForm() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'idle'|'submitting'|'done'|'error'>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setMessage('')
    const user = getUser()
    const payload = {
      title,
      description,
      employer_id: user?.id,
      employer_username: user?.username,
      tg_init_data: getInitDataString()
    }
    try {
      const res = await fetch(`/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const t = await res.text().catch(()=> '')
        throw new Error(t || 'Failed to submit')
      }
      setStatus('done')
      setMessage('Submitted for approval')
      setTitle('')
      setDescription('')
    } catch (e: any) {
      setStatus('error')
      setMessage(e.message || 'Error')
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 8 }}>
      <input placeholder="Job Title" value={title} onChange={e=>setTitle(e.target.value)} required/>
      <textarea placeholder="Job Description" value={description} onChange={e=>setDescription(e.target.value)} required/>
      <button type="submit" disabled={status==='submitting'}>Submit</button>
      {message ? <div>{message}</div> : null}
    </form>
  )
}

import { useState } from 'react'
import { getUser, getInitDataString } from '../lib/telegram'

export default function EmployerForm() {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [salary, setSalary] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'idle'|'submitting'|'done'|'error'>('idle')
  const [message, setMessage] = useState('')

  const categories = [
    'Technology', 'Healthcare', 'Education', 'Finance', 'Marketing', 
    'Design', 'Engineering', 'Sales', 'Customer Service', 'Other'
  ]

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setMessage('')
    const user = getUser()
    const payload = {
      title,
      category,
      salary,
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
      setCategory('')
      setSalary('')
      setDescription('')
    } catch (e: any) {
      setStatus('error')
      setMessage(e.message || 'Error')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: 28, fontWeight: 700 }}>Post a New Job</h2>
          <div style={{ marginTop: 6, color: '#64748b' }}>Share your role with top talent in minutes</div>
        </div>
        
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16, background: 'white', padding: 28, borderRadius: 16, boxShadow: '0 10px 30px rgba(15,23,42,0.08)' }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
            Job Title *
          </label>
          <input 
            placeholder="e.g., Senior Frontend Developer" 
            value={title} 
            onChange={e=>setTitle(e.target.value)} 
            required
            style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#f8fafc' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
            Category *
          </label>
          <select 
            value={category} 
            onChange={e=>setCategory(e.target.value)} 
            required
            style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#f8fafc' }}
          >
            <option value="">Select a category</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          </div>

          <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
            Salary *
          </label>
          <input 
            placeholder="e.g., $80,000 - $100,000" 
            value={salary} 
            onChange={e=>setSalary(e.target.value)} 
            required
            style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#f8fafc' }}
          />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#374151' }}>
            Job Description *
          </label>
          <textarea 
            placeholder="Describe the job responsibilities, requirements, and benefits..." 
            value={description} 
            onChange={e=>setDescription(e.target.value)} 
            required
            rows={6}
            style={{ width: '100%', padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, resize: 'vertical', background: '#f8fafc' }}
          />
        </div>

        <button 
          type="submit" 
          disabled={status==='submitting'}
          style={{ 
            background: status === 'submitting' ? '#94a3b8' : '#2563eb',
            color: 'white',
            padding: '12px 20px',
            border: 'none',
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 600,
            cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          {status === 'submitting' ? 'Submitting...' : 'Submit Job Post'}
        </button>
        
        {message && (
          <div style={{ 
            padding: 12,
            borderRadius: 10,
            background: status === 'error' ? '#fef2f2' : '#eff6ff',
            color: status === 'error' ? '#dc2626' : '#1d4ed8',
            border: `1px solid ${status === 'error' ? '#fecaca' : '#bfdbfe'}`
          }}>
            {message}
          </div>
        )}
      </form>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import EmployerForm from '../components/EmployerForm'
import { getStartParam } from '../lib/telegram'
import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()
  const [mode, setMode] = useState<'choose'|'employer'|'seeker'>('choose')

  useEffect(() => {
    const sp = getStartParam()
    if (sp && sp.startsWith('jobId_')) {
      const id = sp.replace('jobId_', '').replace(/[^0-9]/g, '')
      router.replace(`/job/${id}`)
    } else if (sp === 'employer') {
      setMode('employer')
    } else if (sp === 'seeker') {
      setMode('seeker')
    }
  }, [router])

  if (mode === 'choose') {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <h2>Choose your role</h2>
        <button onClick={()=>setMode('employer')}>I am an Employer</button>
        <button onClick={()=>setMode('seeker')}>I am a Job Seeker</button>
      </div>
    )
  }

  if (mode === 'employer') {
    return (
      <div style={{ padding: 12 }}>
        <h2>Post a Job</h2>
        <EmployerForm />
      </div>
    )
  }

  return (
    <div style={{ padding: 12 }}>
      <h2>Welcome</h2>
      <p>Open a job from the channel to apply.</p>
    </div>
  )
}

import { useState } from 'react'
import type { UserRole } from '../types'
import { supabase } from '../lib/supabase'
import { signInLocally } from '../lib/localAuth'

export function Auth({ onLocalLogin }: { onLocalLogin: (role: UserRole) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const submit = async () => {
    setMessage('')
    if (!supabase) {
      const session = signInLocally(email, password)
      if (!session) { setMessage('Incorrect email or password. Please try again.'); return }
      onLocalLogin(session.role)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
  }

  return <main className="auth"><section className="card auth-card"><div className="hospital-mark">TH</div><h1>True Hospitals</h1><p>Sign in to Surgery Profitability.</p><label className="field"><span>Email address</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@truehospitals.com" autoComplete="username" /></label><label className="field"><span>Password</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e=>e.key === 'Enter' && submit()} /></label><button className="primary" onClick={submit}>Sign in</button>{message && <p className="status auth-error">{message}</p>}</section></main>
}

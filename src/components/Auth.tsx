import { useRef, useState } from 'react'
import type { UserRole } from '../types'
import { supabase } from '../lib/supabase'
import { signInLocally } from '../lib/localAuth'

export function Auth({ onLocalLogin }: { onLocalLogin: (role: UserRole) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const passwordInput = useRef<HTMLInputElement>(null)
  const [showPassword, setShowPassword] = useState(false)

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

  return (
  <main className="auth">
    <section className="card auth-card">
      <div className="hospital-mark">TH</div>
      <h1>True Hospitals</h1>
      <p>Sign in to Surgery Profitability.</p>

      <label className="field">
        <span>Email address</span>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="name@truehospitals.com"
          autoComplete="username"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              passwordInput.current?.focus()
            }
          }}
        />
      </label>

      <label className="field">
              <span>Password</span>

                     <div className="password-wrap">
                        <input
                                 ref={passwordInput}
                                 type={showPassword ? 'text' : 'password'}
                                 value={password}
                                 onChange={e => setPassword(e.target.value)}
                                 autoComplete="current-password"
                                 onKeyDown={e => {
                                 if (e.key === 'Enter') submit()
                                     }}
                         />

                       <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                              {showPassword ? (
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.8 10.8 0 0 1 12 5c5.5 0 9.3 4.4 10 7-0.3 1.2-1.3 2.8-2.9 4.2M6.2 6.2C4.1 7.7 2.6 10.2 2 12c0.7 2.6 4.5 7 10 7 1 0 1.9-0.1 2.8-0.4" />
                                </svg>
                                 ) : (
                                       <svg viewBox="0 0 24 24" aria-hidden="true">
                                       <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                                       <circle cx="12" cy="12" r="3" />
                                       </svg>
                                       )}
                          </button>
                    </div>
          </label>

      <button className="primary" onClick={submit}>Sign in</button>

      {message && <p className="status auth-error">{message}</p>}
    </section>
  </main>
 )
}
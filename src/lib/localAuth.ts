import type { UserRole } from '../types'

type LocalSession = { email: string; role: UserRole }

// Local demonstration login only. Move authentication to Supabase before public deployment.
const accounts: Array<LocalSession & { password: string }> = [
  { email: 'admin@truehospitals.com', password: 'True@123', role: 'admin' },
  { email: 'sales@truehospitals.com', password: 'True@123', role: 'sales' }
]
const storageKey = 'trueHospitalsSession'

export function signInLocally(email: string, password: string): LocalSession | null {
  const account = accounts.find(item => item.email === email.trim().toLowerCase() && item.password === password)
  if (!account) return null
  const session = { email: account.email, role: account.role }
  sessionStorage.setItem(storageKey, JSON.stringify(session))
  return session
}

export function getLocalSession(): LocalSession | null {
  try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { return null }
}

export function signOutLocally() { sessionStorage.removeItem(storageKey) }

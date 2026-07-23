import { useEffect, useState } from 'react'
import type { PatientQueueEntry, PatientQueueSubmission, UserRole } from '../types'
import { createPatientQueueEntry, getMyPatientQueueEntries } from '../services/patientQueueService'

const emptyForm: PatientQueueSubmission = { fullName: '', phone: '', gender: 'female', dateOfBirth: '', doctorName: '', referralName: '', notes: '' }

export function SalesPatientEntry({ role }: { role: Exclude<UserRole, 'admin'> }) {
  const [form, setForm] = useState<PatientQueueSubmission>(emptyForm)
  const [entries, setEntries] = useState<PatientQueueEntry[]>([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const sourceLabel = role === 'online_sales' ? 'Online Sales' : 'Offline Sales'

  const loadEntries = () => getMyPatientQueueEntries().then(setEntries).catch(() => setMessage('Could not load your queue requests.'))
  useEffect(() => {
    void loadEntries()
  }, [])
  const update = <K extends keyof PatientQueueSubmission>(key: K, value: PatientQueueSubmission[K]) => setForm(current => ({ ...current, [key]: value }))

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    if (!/^\d{10}$/.test(form.phone)) { setMessage('Enter a valid 10-digit phone number.'); return }
    setSaving(true)
    try {
      await createPatientQueueEntry(form)
      setForm(emptyForm)
      setMessage('Patient queue request saved. It is ready to sync to the IPD queue.')
      loadEntries()
    } catch {
      setMessage('Could not save the patient queue request.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main>
      <p className="notice">Create the initial queue entry only. Reception completes IPD admission, ward, insurance, package, and surgery details.</p>
      <div className="queue-layout">
        <section className="card">
          <div className="queue-heading"><div><h1>Add patient to IPD queue</h1><p className="form-help">Source and sales owner are recorded automatically.</p></div><span className="source-badge">{sourceLabel}</span></div>
          <form onSubmit={submit}>
            <div className="two">
              <label className="field"><span>Full name</span><input required value={form.fullName} onChange={e => update('fullName', e.target.value)} placeholder="Patient full name" /></label>
              <label className="field"><span>Phone number</span><input required inputMode="numeric" maxLength={10} value={form.phone} onChange={e => update('phone', e.target.value.replace(/\D/g, ''))} placeholder="10-digit mobile number" /></label>
              <label className="field"><span>Gender</span><select value={form.gender} onChange={e => update('gender', e.target.value as PatientQueueSubmission['gender'])}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
              <label className="field"><span>Date of birth</span><input required type="date" value={form.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={e => update('dateOfBirth', e.target.value)} /></label>
            </div>
            <div className="two">
              <label className="field"><span>Registration mode</span><input value="IPD" readOnly /></label>
              <label className="field"><span>Registration source</span><input value={sourceLabel} readOnly /></label>
            </div>
            <div className="two">
              <label className="field"><span>Doctor <em>optional — Reception can assign later</em></span><input value={form.doctorName} onChange={e => update('doctorName', e.target.value)} placeholder="Doctor name, if known" /></label>
              <label className="field"><span>Referral <em>optional</em></span><input value={form.referralName} onChange={e => update('referralName', e.target.value)} placeholder="Referrer or partner name" /></label>
            </div>
            <label className="field"><span>Sales notes <em>optional</em></span><textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Lead details or useful handover notes" rows={3} /></label>
            <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Add to IPD queue'}</button>
            {message && <p className="status">{message}</p>}
          </form>
        </section>
        <aside className="card summary"><h1>My queue requests</h1>{entries.length === 0 ? <p className="form-help">No patient requests created yet.</p> : entries.slice(0, 6).map(entry => <div className="queue-entry" key={entry.id}><strong>{entry.full_name}</strong><span>{entry.phone}</span><small>{entry.doctor_name || 'Doctor to be assigned'} · {entry.referral_name || 'No referral'}</small><em>{entry.legacy_queue_status === 'pending_sync' ? 'Pending IPD sync' : entry.legacy_queue_status}</em></div>)}</aside>
      </div>
    </main>
  )
}

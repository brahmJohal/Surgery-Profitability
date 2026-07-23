import { supabase } from '../lib/supabase'
import type { PatientQueueEntry, PatientQueueSubmission } from '../types'

const storageKey = 'salesPatientQueueEntries'
const localEntries = (): PatientQueueEntry[] => JSON.parse(localStorage.getItem(storageKey) || '[]') as PatientQueueEntry[]

export async function createPatientQueueEntry(values: PatientQueueSubmission): Promise<string> {
  if (!supabase) {
    const entry: PatientQueueEntry = { id: crypto.randomUUID(), full_name: values.fullName.trim(), phone: values.phone, doctor_name: values.doctorName.trim() || null, referral_name: values.referralName.trim() || null, legacy_queue_status: 'pending_sync', created_at: new Date().toISOString() }
    localStorage.setItem(storageKey, JSON.stringify([entry, ...localEntries()]))
    return entry.id
  }
  const { data, error } = await supabase.rpc('create_sales_patient_queue_entry', { p_full_name: values.fullName, p_phone: values.phone, p_gender: values.gender, p_date_of_birth: values.dateOfBirth, p_doctor_name: values.doctorName || null, p_referral_name: values.referralName || null, p_notes: values.notes || null })
  if (error) throw error
  return data as string
}

export async function getMyPatientQueueEntries(): Promise<PatientQueueEntry[]> {
  if (!supabase) return localEntries()
  const { data, error } = await supabase.rpc('list_my_sales_patient_queue_entries')
  if (error) throw error
  return (data || []) as PatientQueueEntry[]
}

export type Surgery = { id: string; name: string; standard_billing: number; pharma_cost: number; anaesthesia_cost: number; lab_cost: number; base_rental: number; other_fixed_cost: number; active: boolean }
export type SurgerySummary = Pick<Surgery, 'id' | 'name' | 'standard_billing'>
export type Calculation = { billing: number; doctorShare: number; referralShare: number; extraRental: number }
export type UserRole = 'admin' | 'finance' | 'offline_sales' | 'online_sales'
export type ProfitResult = { profit: number; margin: number }
export type PatientQueueEntry = { id: string; full_name: string; phone: string; doctor_name: string | null; referral_name: string | null; legacy_queue_status: 'pending_sync' | 'synced' | 'sync_failed'; created_at: string }
export type PatientQueueSubmission = { fullName: string; phone: string; gender: 'female' | 'male' | 'other'; dateOfBirth: string; doctorName: string; referralName: string; notes: string }

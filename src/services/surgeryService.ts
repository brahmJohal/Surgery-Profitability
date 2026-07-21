import { supabase } from '../lib/supabase'
import { demoSurgeries } from '../data/demo'
import type { Calculation, ProfitResult, Surgery, SurgerySummary, UserRole } from '../types'

const localSurgeries = (): Surgery[] => JSON.parse(localStorage.getItem('demoSurgeries') || 'null') || demoSurgeries
const localFixedCost = (surgery: Surgery) => surgery.pharma_cost + surgery.anaesthesia_cost + surgery.lab_cost + surgery.base_rental + surgery.other_fixed_cost

export async function getSurgeries(role: UserRole): Promise<SurgerySummary[]> {
  if (!supabase) return localSurgeries()
  const operation = role === 'admin' ? 'admin_list_surgeries' : 'get_calculator_surgeries'
  const { data, error } = await supabase.rpc(operation)
  if (error) throw error
  return data as SurgerySummary[]
}
export async function getOnlineSalesFixedReferral(): Promise<number> {
  if (!supabase) return 15000
  const { data, error } = await supabase.rpc('get_online_sales_fixed_referral')
  if (error) throw error
  return Number(data || 15000)
}

export async function saveOnlineSalesFixedReferral(amount: number) {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_set_online_sales_fixed_referral', {
    p_amount: amount,
  })
  if (error) throw error
}

export async function calculateProfit(surgeryId: string, values: Calculation): Promise<ProfitResult> {
  if (!supabase) {
    const surgery = localSurgeries().find(item => item.id === surgeryId)
    const profit = values.billing - (surgery ? localFixedCost(surgery) : 0) - values.doctorShare - values.referralShare - values.extraRental
    return { profit, margin: values.billing ? profit / values.billing * 100 : 0 }
  }
  const { data, error } = await supabase.rpc('calculate_surgery_profit', { p_surgery_id:surgeryId, p_billing:values.billing, p_doctor_share:values.doctorShare, p_referral_share:values.referralShare, p_extra_rental:values.extraRental })
  if (error) throw error
  const result = data?.[0]
  return { profit:Number(result?.profit || 0), margin:Number(result?.margin || 0) }
}

export async function saveCalculation(surgeryId: string, values: Calculation) {
  if (!supabase) return
  const { error } = await supabase.rpc('create_surgery_calculation', { p_surgery_id:surgeryId, p_billing:values.billing, p_doctor_share:values.doctorShare, p_referral_share:values.referralShare, p_extra_rental:values.extraRental })
  if (error) throw error
}

export async function saveSurgery(surgery: Partial<Surgery>) {
  if (!supabase) {
    const surgeries = localSurgeries()
    const saved = surgery.id ? surgeries.map(item => item.id === surgery.id ? {...item, ...surgery} as Surgery : item) : [...surgeries, {...surgery, id:crypto.randomUUID(), active:true} as Surgery]
    localStorage.setItem('demoSurgeries', JSON.stringify(saved))
    return
  }
  if (surgery.id) {
    const { error } = await supabase.rpc('admin_update_surgery', { p_id:surgery.id, p_name:surgery.name, p_standard_billing:surgery.standard_billing, p_pharma_cost:surgery.pharma_cost, p_anaesthesia_cost:surgery.anaesthesia_cost, p_lab_cost:surgery.lab_cost, p_base_rental:surgery.base_rental, p_other_fixed_cost:surgery.other_fixed_cost, p_active:surgery.active })
    if (error) throw error
    return
  }
  const { error } = await supabase.rpc('add_surgery', { p_name:surgery.name, p_standard_billing:surgery.standard_billing, p_pharma_cost:surgery.pharma_cost, p_anaesthesia_cost:surgery.anaesthesia_cost, p_lab_cost:surgery.lab_cost, p_base_rental:surgery.base_rental, p_other_fixed_cost:surgery.other_fixed_cost })
  if (error) throw error
}

export type Surgery = { id: string; name: string; standard_billing: number; pharma_cost: number; anaesthesia_cost: number; lab_cost: number; base_rental: number; other_fixed_cost: number; active: boolean }
export type SurgerySummary = Pick<Surgery, 'id' | 'name' | 'standard_billing'>
export type Calculation = { billing: number; doctorShare: number; referralShare: number; extraRental: number }
export type UserRole = 'admin' | 'sales' | 'online_sales'
export type ProfitResult = { profit: number; margin: number }

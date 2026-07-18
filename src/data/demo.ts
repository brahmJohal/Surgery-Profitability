import type { Surgery } from '../types'
export const demoSurgeries: Surgery[] = [
  { id:'cataract', name:'Cataract surgery', standard_billing:35000, pharma_cost:6000, anaesthesia_cost:2500, lab_cost:1500, base_rental:4000, other_fixed_cost:1000, active:true },
  { id:'arthroscopy', name:'Knee arthroscopy', standard_billing:90000, pharma_cost:18000, anaesthesia_cost:7000, lab_cost:4000, base_rental:8000, other_fixed_cost:2500, active:true },
  { id:'delivery', name:'Normal delivery', standard_billing:45000, pharma_cost:5500, anaesthesia_cost:0, lab_cost:2500, base_rental:5000, other_fixed_cost:1500, active:true }
]

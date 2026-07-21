import { useEffect, useState } from 'react'
import type { Calculation, ProfitResult, Surgery, SurgerySummary, UserRole } from './types'
import { calculateProfit, getSurgeries, saveCalculation, saveSurgery } from './services/surgeryService'
import { money, numberValue } from './lib/money'
import { supabase } from './lib/supabase'
import { getLocalSession, signOutLocally } from './lib/localAuth'
import { Auth } from './components/Auth'

const empty: Calculation = { billing: 0, doctorShare: 0, referralShare: 0, extraRental: 0 }
const blankCosts = { standard_billing:0, pharma_cost:0, anaesthesia_cost:0, lab_cost:0, base_rental:0, other_fixed_cost:0 }
const emptyResult: ProfitResult = { profit: 0, margin: 0 }
type CostFields = typeof blankCosts
const isFullSurgery = (surgery: SurgerySummary): surgery is Surgery => 'pharma_cost' in surgery
const fixedCost = (surgery: Surgery) => surgery.pharma_cost + surgery.anaesthesia_cost + surgery.lab_cost + surgery.base_rental + surgery.other_fixed_cost
const surgeryCosts = (surgery: Surgery): CostFields => ({ standard_billing:surgery.standard_billing, pharma_cost:surgery.pharma_cost, anaesthesia_cost:surgery.anaesthesia_cost, lab_cost:surgery.lab_cost, base_rental:surgery.base_rental, other_fixed_cost:surgery.other_fixed_cost })

function AmountInput({ label, value, onChange, help }: { label:string; value:number; onChange:(v:number)=>void; help?:string }) {
  return <label className="field"><span>{label} {help && <em>{help}</em>}</span><div className="amount"><b>₹</b><input type="number" min="0" value={value || ''} onChange={e => onChange(numberValue(e.target.value))} placeholder="0" /></div></label>
}
function CostInputs({ costs, setCosts }: { costs:CostFields; setCosts:(value:CostFields)=>void }) {
  const set = (key:keyof CostFields) => (value:number) => setCosts({...costs, [key]:value})
  return <div className="three"><AmountInput label="Standard billing" value={costs.standard_billing} onChange={set('standard_billing')}/><AmountInput label="Pharma" value={costs.pharma_cost} onChange={set('pharma_cost')}/><AmountInput label="Anaesthesia" value={costs.anaesthesia_cost} onChange={set('anaesthesia_cost')}/><AmountInput label="Lab" value={costs.lab_cost} onChange={set('lab_cost')}/><AmountInput label="Base rental" value={costs.base_rental} onChange={set('base_rental')}/><AmountInput label="Other fixed costs" value={costs.other_fixed_cost} onChange={set('other_fixed_cost')}/></div>
}
function Metric({label,value}:{label:string;value:string}) { return <div className="metric"><span>{label}</span><b>{value}</b></div> }

export default function App() {
  const [role, setRole] = useState<UserRole | null>(() => !supabase ? getLocalSession()?.role || null : null)
  const [surgeries, setSurgeries] = useState<SurgerySummary[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [values, setValues] = useState<Calculation>(empty)
  const [result, setResult] = useState<ProfitResult>(emptyResult)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCosts, setNewCosts] = useState<CostFields>(blankCosts)
  const [editingId, setEditingId] = useState('')
  const [editingCosts, setEditingCosts] = useState<CostFields>(blankCosts)
  const isAdmin = role === 'admin'
  const isOnlineSales = role === 'online_sales'

  async function roleFromSession(userId: string): Promise<UserRole> {
    if (!supabase) return 'sales'
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
    return data?.role === 'admin' ? 'admin' : data?.role === 'online_sales' ? 'online_sales' : 'sales'
  }
  useEffect(() => {
    if (!supabase) return
    const applySession = async (session: { user: { id: string } } | null) => setRole(session ? await roleFromSession(session.user.id) : null)
    supabase.auth.getSession().then(({data}) => { void applySession(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void applySession(session) })
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!role) return
    setLoading(true)
    getSurgeries(role).then(items => {
      setSurgeries(items)
      const first = items[0]
      setSelectedId(first?.id || '')
      setValues({...empty, billing:first?.standard_billing || 0, referralShare: role === 'online_sales' ? 15000 : 0})
      if (first && isFullSurgery(first)) {
        setEditingId(first?.id || '')
        setEditingCosts(surgeryCosts(first))
      }
    }).catch(() => setStatus('Could not load surgeries.')).finally(() => setLoading(false))
  }, [role])

  const surgery = surgeries.find(item => item.id === selectedId)
  const adminFixedCost = surgery && isFullSurgery(surgery) ? fixedCost(surgery) : 0
  useEffect(() => {
    if (!surgery) { setResult(emptyResult); return }
    let stale = false
    calculateProfit(surgery.id, values).then(next => { if (!stale) setResult(next) }).catch(() => { if (!stale) setStatus('Unable to calculate profit right now.') })
    return () => { stale = true }
  }, [surgery?.id, values.billing, values.doctorShare, values.referralShare, values.extraRental])

  const update = (key:keyof Calculation) => (value:number) => setValues(current => ({...current, [key]:value}))
  const choose = (id:string) => { const item = surgeries.find(s => s.id === id); setSelectedId(id); setValues({...empty, billing:item?.standard_billing || 0, referralShare:role === 'online_sales' ? 15000 : 0}); setStatus('') }
  const refresh = async () => { if (!role) return []; const items = await getSurgeries(role); setSurgeries(items); return items }
  const save = async () => { if (!surgery) return; try { await saveCalculation(surgery.id, values); setStatus('Calculation saved successfully.') } catch { setStatus('Could not save. Check your database setup.') } }
  const addSurgery = async () => {
    const name = newName.trim()
    if (!name) { setStatus('Please enter the surgery name.'); return }
    if (surgeries.some(item => item.name.toLowerCase() === name.toLowerCase())) { setStatus('This surgery already exists.'); return }
    try { await saveSurgery({ name, ...newCosts, active:true }); const items = await refresh(); const added = items.find(item => item.name === name); if (added) choose(added.id); setNewName(''); setNewCosts(blankCosts); setStatus('New surgery added successfully.') } catch { setStatus('Could not add surgery. Check your database setup.') }
  }
  const selectExisting = (id: string) => { const item = surgeries.find(s => s.id === id); if (!item || !isFullSurgery(item)) return; setEditingId(id); setEditingCosts(surgeryCosts(item)) }
  const saveExisting = async () => { const existing = surgeries.find(item => item.id === editingId); if (!existing || !isFullSurgery(existing)) return; try { await saveSurgery({ id:editingId, name:existing.name, active:existing.active, ...editingCosts }); const items = await refresh(); const edited = items.find(item => item.id === editingId); if (edited && selectedId === editingId) setValues(current => ({...current, billing:edited.standard_billing})); setStatus('Existing surgery expenses updated.') } catch { setStatus('Could not update this surgery.') } }
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); else { signOutLocally(); setRole(null) } }

  if (!role) return <Auth onLocalLogin={setRole} />
  if (loading) return <main className="loading">Loading calculator…</main>
  return <>
  <header>
    <div>
      <strong>True Hospitals</strong>
      <small>{isAdmin ? 'Admin dashboard' : 'Sales calculator'}</small>
    </div>

    <div className="header-actions">
      <span>{isAdmin ? 'Administrator' : 'Sales team'}</span>
      <button className="signout" onClick={signOut}>Sign out</button>
    </div>
  </header>

  <main>
    <p className="notice">
      Select a procedure, enter the case-specific payouts, and confirm profitability before closing the surgery.
    </p>

    <div className="grid">
      <section className="card">
        <h1>Calculate a surgery</h1>

        <label className="field">
          <span>Surgery / procedure</span>
          <select value={selectedId} onChange={e => choose(e.target.value)}>
            {surgeries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <AmountInput
          label="Surgery billing"
          help="standard amount is pre-filled"
          value={values.billing}
          onChange={update('billing')}
        />

        <h2>Enter for this case</h2>

        <div className="two">
          <AmountInput
            label="Doctor share"
            value={values.doctorShare}
            onChange={update('doctorShare')}
          />

          {!isOnlineSales && (
            <AmountInput
              label="Referral share"
              value={values.referralShare}
              onChange={update('referralShare')}
            />
          )}
        </div>

        {isOnlineSales && (
          <p className="form-help">Fixed referral share: ₹15,000</p>
        )}

        <AmountInput
          label="Extra rental, if any"
          value={values.extraRental}
          onChange={update('extraRental')}
        />

        <div className="payout">
          <span>Total variable payouts</span>
          <b>{money(values.doctorShare + values.referralShare + values.extraRental)}</b>
        </div>

        <button className="primary" onClick={save}>Save calculation</button>
        {status && <p className="status">{status}</p>}
      </section>

      <aside className="card summary">
        <h1>Profit summary</h1>

        <div className={result.profit < 0 ? 'result loss' : 'result'}>
          <small>{result.profit < 0 ? 'Estimated loss' : 'Estimated profit'}</small>
          <strong>{money(Math.abs(result.profit))}</strong>
        </div>

        <Metric label="Surgery billing" value={money(values.billing)} />
        {isAdmin && <Metric label="Fixed procedure costs" value={'− ' + money(adminFixedCost)} />}
        <Metric label="Doctor share" value={'− ' + money(values.doctorShare)} />
        <Metric label="Referral share" value={'− ' + money(values.referralShare)} />
        <Metric label="Extra rental" value={'− ' + money(values.extraRental)} />

        <p className="margin">Profit margin <b>{result.margin.toFixed(1)}%</b></p>
      </aside>
    </div>

    <details className="manage">
      <summary>Add a new surgery</summary>

      <div className="card manage-card">
        <p className="form-help">Enter the standard billing and all expected expenses for this new surgery.</p>

        <label className="field">
          <span>Surgery name</span>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="e.g. Appendix surgery"
          />
        </label>

        <CostInputs costs={newCosts} setCosts={setNewCosts} />
        <button className="primary" onClick={addSurgery}>Add surgery</button>
      </div>
    </details>

    {isAdmin && (
      <details className="manage" open>
        <summary>Admin: Review or edit an existing surgery</summary>

        <div className="card manage-card">
          <label className="field">
            <span>Existing surgery</span>
            <select value={editingId} onChange={e => selectExisting(e.target.value)}>
              {surgeries.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          <CostInputs costs={editingCosts} setCosts={setEditingCosts} />
          <button className="primary" onClick={saveExisting}>Save expense changes</button>
        </div>
      </details>
    )}
  </main>
</>
}

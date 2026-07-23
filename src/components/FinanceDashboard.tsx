import { useMemo, useState } from 'react'

type PayableStatus = 'submitted' | 'approved' | 'paid' | 'on_hold'
type Payable = { id: string; payee: string; type: string; caseRef: string; gross: number; tds: number; status: PayableStatus; bank: string }

const initialPayables: Payable[] = [
  { id: 'PAY-101', payee: 'Dr. Anil Kumar', type: 'Doctor', caseRef: 'IPD-24118', gross: 32000, tds: 3200, status: 'submitted', bank: 'HDFC •••• 4821' },
  { id: 'PAY-102', payee: 'Health Connect Partners', type: 'Referral', caseRef: 'IPD-24121', gross: 15000, tds: 0, status: 'approved', bank: 'ICICI •••• 9034' },
  { id: 'PAY-103', payee: 'MedEquip Rentals', type: 'OT Rental', caseRef: 'IPD-24120', gross: 9800, tds: 196, status: 'submitted', bank: 'Axis •••• 1276' },
  { id: 'PAY-104', payee: 'Precision Diagnostics', type: 'Outside Lab', caseRef: 'IPD-24116', gross: 5400, tds: 108, status: 'paid', bank: 'HDFC •••• 6810' },
]

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

export function FinanceDashboard() {
  const [payables, setPayables] = useState(initialPayables)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'queue' | 'bank'>('dashboard')
  const [message, setMessage] = useState('')
  const totals = useMemo(() => ({
    submitted: payables.filter(item => item.status === 'submitted').reduce((sum, item) => sum + item.gross - item.tds, 0),
    approved: payables.filter(item => item.status === 'approved').reduce((sum, item) => sum + item.gross - item.tds, 0),
    paid: payables.filter(item => item.status === 'paid').reduce((sum, item) => sum + item.gross - item.tds, 0),
  }), [payables])

  const changeStatus = (id: string, status: PayableStatus) => {
    setPayables(items => items.map(item => item.id === id ? { ...item, status } : item))
    setMessage(status === 'approved' ? 'Payment approved for the next Monday run.' : 'Payment marked as paid. Add the bank reference when the gateway is connected.')
  }

  return <main>
    <section className="finance-hero">
      <div><p className="eyebrow">Finance workspace</p><h1>Hospital reconciliation</h1><p>Review payables, approve the Monday payment batch, and keep doctor, partner, vendor, rental, implant, and lab payments traceable.</p></div>
      <button className="primary" onClick={() => { setActiveTab('queue'); setMessage('Add a payable through the secure Finance API once its endpoint is connected.') }}>Add payable</button>
    </section>

    <nav className="finance-tabs" aria-label="Finance workspace"><button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>Overview</button><button className={activeTab === 'queue' ? 'active' : ''} onClick={() => setActiveTab('queue')}>Payment queue</button><button className={activeTab === 'bank' ? 'active' : ''} onClick={() => setActiveTab('bank')}>Bank details</button></nav>

    {activeTab === 'dashboard' && <>
      <div className="finance-metrics"><Metric label="Awaiting approval" value={money(totals.submitted)} caption="Submitted payables" /><Metric label="Monday payment run" value={money(totals.approved)} caption="Approved for payment" /><Metric label="Paid this week" value={money(totals.paid)} caption="Confirmed payments" /><Metric label="TDS tracked" value={money(payables.reduce((sum, item) => sum + item.tds, 0))} caption="Across current payables" /></div>
      <section className="card"><div className="section-title"><div><h1>Monday payment checklist</h1><p className="form-help">Approve all verified payables before the weekly payment cutoff.</p></div><span className="source-badge">Next run: Monday</span></div><ol className="checklist"><li>Validate patient case, MOU/rate, invoice, and payee bank details.</li><li>Confirm TDS and net payable amount.</li><li>Approve the batch and release it through the bank or UPI provider.</li><li>Store payment reference, receipt, and patient-case allocation.</li></ol></section>
    </>}

    {activeTab === 'queue' && <section className="card"><div className="section-title"><div><h1>Payment queue</h1><p className="form-help">Net amount is gross amount less TDS.</p></div><span className="source-badge">{payables.filter(item => item.status === 'approved').length} ready for Monday</span></div><div className="payable-list">{payables.map(item => <article className="payable" key={item.id}><div><strong>{item.payee}</strong><span>{item.type} · {item.caseRef} · {item.id}</span><small>{item.bank}</small></div><div className="payable-amount"><b>{money(item.gross - item.tds)}</b><span>Gross {money(item.gross)} · TDS {money(item.tds)}</span></div><div className="payable-actions"><em className={`payment-status ${item.status}`}>{item.status.replace('_', ' ')}</em>{item.status === 'submitted' && <button onClick={() => changeStatus(item.id, 'approved')}>Approve</button>}{item.status === 'approved' && <button className="primary" onClick={() => changeStatus(item.id, 'paid')}>Mark paid</button>}</div></article>)}</div>{message && <p className="status">{message}</p>}</section>}

    {activeTab === 'bank' && <section className="card bank-card"><div><h1>Payee bank details</h1><p className="form-help">Use verified bank or UPI details only. The production payment integration must store encrypted credentials and bank references on the server.</p></div><div className="two"><label className="field"><span>Account holder</span><input placeholder="Payee legal name" /></label><label className="field"><span>Account number</span><input inputMode="numeric" placeholder="Bank account number" /></label><label className="field"><span>IFSC code</span><input placeholder="e.g. HDFC0001234" /></label><label className="field"><span>UPI ID <em>optional</em></span><input placeholder="name@bank" /></label></div><button className="primary" onClick={() => setMessage('Bank-detail saving will be enabled with the protected Finance API.')}>Save bank details</button>{message && <p className="status">{message}</p>}</section>}
  </main>
}

function Metric({ label, value, caption }: { label: string; value: string; caption: string }) { return <section className="finance-metric"><span>{label}</span><strong>{value}</strong><small>{caption}</small></section> }

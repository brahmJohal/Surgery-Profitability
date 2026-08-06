import { useMemo, useRef, useState } from "react";
import { importReconciliationFile } from "../lib/excelImport";

type PayableStatus = "submitted" | "approved" | "paid" | "on_hold";
type Payable = {
  id: string;
  payee: string;
  type: string;
  caseRef: string;
  gross: number;
  tds: number;
  status: PayableStatus;
  bank: string;
  eligibleRevenue?: number;
  excludedCosts?: number;
  percentage?: number;
};
type ReconciliationRule = {
  id: string;
  payee: string;
  role: string;
  patientSource: "doctor_patient" | "hospital_patient";
  payoutMethod: "percentage" | "surgeon_fee";
  surgeonFee: number;
  revenueBasis: "billed" | "settled_tpa" | "payment_received" | "remaining_amount" | "partner_commission" | "fixed";
  percentage: number;
  deductExternalLab: boolean;
  deductImplant: boolean;
  deductDci: boolean;
  deductCrossConsultation: boolean;
  deductReferralCommission: boolean;
  deductExternalDiagnostics: boolean;
  deductAnaesthetist: boolean;
  deductConsumables: boolean;
  deductSpecialEquipment: boolean;
  deductExternalVisit: boolean;
  opdSharePercentage: number;
  opdPrice: number;
  fixedRental: number;
  fixedMonthlyAmount: number;
  effectiveFrom: string;
  effectiveTo: string;
  wardVisitCharge: number;
  icuEmergencyVisitCharge: number;
  paymentTerms: string;
  notes: string;
  mouFileName?: string;
  mouUploadedAt?: string;
};
type PayableGroup = {
  key: string;
  payee: string;
  type: string;
  items: Payable[];
  gross: number;
  tds: number;
  status: PayableStatus;
};
type PayeeProfile = {
  name: string;
  category: string;
  pan: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  upi: string;
};

const savedPayables = (): Payable[] =>
  JSON.parse(localStorage.getItem("financePayables") || "[]");
const savedPayeeProfiles = (): PayeeProfile[] =>
  JSON.parse(localStorage.getItem("financePayeeProfiles") || "[]");
const emptyRule: ReconciliationRule = {
  id: "",
  payee: "",
  role: "Doctor",
  patientSource: "doctor_patient",
  payoutMethod: "percentage",
  surgeonFee: 0,
  revenueBasis: "remaining_amount",
  percentage: 20,
  deductExternalLab: true,
  deductImplant: true,
  deductDci: false,
  deductCrossConsultation: false,
  deductReferralCommission: false,
  deductExternalDiagnostics: false,
  deductAnaesthetist: false,
  deductConsumables: false,
  deductSpecialEquipment: false,
  deductExternalVisit: false,
  opdSharePercentage: 0,
  opdPrice: 0,
  fixedRental: 0,
  fixedMonthlyAmount: 0,
  effectiveFrom: "",
  effectiveTo: "",
  wardVisitCharge: 0,
  icuEmergencyVisitCharge: 0,
  paymentTerms: "",
  notes: "",
};
const savedRules = (): ReconciliationRule[] =>
  JSON.parse(localStorage.getItem("financeReconciliationRules") || "[]").map(
    (rule: Partial<ReconciliationRule>) => ({ ...emptyRule, ...rule }),
  );
const emptyPayeeProfile: PayeeProfile = {
  name: "",
  category: "Doctor",
  pan: "",
  accountHolder: "",
  accountNumber: "",
  ifsc: "",
  upi: "",
};

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export function FinanceDashboard() {
  const [payables, setPayables] = useState<Payable[]>(savedPayables);
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "queue" | "agreements" | "history" | "bank"
  >("dashboard");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [expandedPayees, setExpandedPayees] = useState<string[]>([]);
  const [payeeProfiles, setPayeeProfiles] =
    useState<PayeeProfile[]>(savedPayeeProfiles);
  const [payeeForm, setPayeeForm] = useState<PayeeProfile>(emptyPayeeProfile);
  const [payeeModalOpen, setPayeeModalOpen] = useState(false);
  const [rules, setRules] = useState<ReconciliationRule[]>(savedRules);
  const [ruleForm, setRuleForm] = useState<ReconciliationRule>(emptyRule);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const mouInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savePayables = (next: Payable[]) => {
    setPayables(next);
    localStorage.setItem("financePayables", JSON.stringify(next));
  };
  const saveRules = (next: ReconciliationRule[]) => {
    setRules(next);
    localStorage.setItem("financeReconciliationRules", JSON.stringify(next));
  };
  const totals = useMemo(
    () => ({
      submitted: payables
        .filter((item) => item.status === "submitted")
        .reduce((sum, item) => sum + item.gross - item.tds, 0),
      approved: payables
        .filter((item) => item.status === "approved")
        .reduce((sum, item) => sum + item.gross - item.tds, 0),
      paid: payables
        .filter((item) => item.status === "paid")
        .reduce((sum, item) => sum + item.gross - item.tds, 0),
    }),
    [payables],
  );
  const payableGroups = useMemo<PayableGroup[]>(() => {
    const groups = new Map<string, Payable[]>();
    payables.forEach((item) => {
      const key = item.payee.trim().toLowerCase();
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    return [...groups.entries()].map(([key, items]) => ({
      key,
      payee: items[0].payee,
      type: items[0].type,
      items,
      gross: items.reduce((sum, item) => sum + item.gross, 0),
      tds: items.reduce((sum, item) => sum + item.tds, 0),
      status: items.every((item) => item.status === "paid")
        ? "paid"
        : items.every((item) => item.status === "approved")
          ? "approved"
          : "submitted",
    }));
  }, [payables]);
  const unpaidPayableGroups = useMemo(
    () =>
      payableGroups.flatMap((group) => {
        const items = group.items.filter((item) => item.status !== "paid");
        if (!items.length) return [];
        return [
          {
            ...group,
            items,
            gross: items.reduce((sum, item) => sum + item.gross, 0),
            tds: items.reduce((sum, item) => sum + item.tds, 0),
            status: items.every((item) => item.status === "approved")
              ? "approved"
              : ("submitted" as PayableStatus),
          },
        ];
      }),
    [payableGroups],
  );
  const vendorDirectory = useMemo(() => {
    const imported = payableGroups.map((group) => ({
      name: group.payee,
      category: [...new Set(group.items.map((item) => item.type))].join(", "),
    }));
    const manualOnly = payeeProfiles.filter(
      (profile) =>
        !imported.some(
          (item) =>
            item.name.trim().toLowerCase() ===
            profile.name.trim().toLowerCase(),
        ),
    );
    return [...imported, ...manualOnly].map((item) => ({
      ...item,
      profile: payeeProfiles.find(
        (profile) =>
          profile.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
      ),
    }));
  }, [payableGroups, payeeProfiles]);

  const changeStatus = (id: string, status: PayableStatus) => {
    savePayables(
      payables.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    setMessage(
      status === "approved"
        ? "Payment approved for the next Monday run."
        : "Payment marked as paid. Add the bank reference when the gateway is connected.",
    );
  };

  const changeGroupStatus = (items: Payable[], status: PayableStatus) => {
    const ids = new Set(items.map((item) => item.id));
    savePayables(
      payables.map((item) => (ids.has(item.id) ? { ...item, status } : item)),
    );
    setMessage(
      status === "paid"
        ? `${items[0].payee}'s ${items.length} surgery payout${items.length === 1 ? "" : "s"} marked as paid and removed from Monday's total.`
        : "Payment approved for the next Monday run.",
    );
  };

  const togglePayee = (key: string) =>
    setExpandedPayees((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );
  const savePayeeProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = payeeForm.name.trim();
    if (!name) {
      setMessage("Enter a vendor or payee name.");
      return;
    }
    const profile = {
      ...payeeForm,
      name,
      pan: payeeForm.pan.toUpperCase(),
      ifsc: payeeForm.ifsc.toUpperCase(),
    };
    const next = [
      ...payeeProfiles.filter(
        (item) => item.name.toLowerCase() !== name.toLowerCase(),
      ),
      profile,
    ];
    setPayeeProfiles(next);
    localStorage.setItem("financePayeeProfiles", JSON.stringify(next));
    setPayeeForm(emptyPayeeProfile);
    setPayeeModalOpen(false);
    setMessage(`Details saved for ${name}.`);
  };
  const editPayee = (name: string, category: string) => {
    setPayeeForm(
      payeeProfiles.find(
        (item) => item.name.trim().toLowerCase() === name.trim().toLowerCase(),
      ) || { ...emptyPayeeProfile, name, category },
    );
    setPayeeModalOpen(true);
  };
  const addPayee = () => {
    setPayeeForm(emptyPayeeProfile);
    setPayeeModalOpen(true);
  };

  const openRule = (rule?: ReconciliationRule) => {
    setRuleForm(rule || { ...emptyRule, id: `RULE-${Date.now()}` });
    setRuleModalOpen(true);
  };
  const saveRule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payee = ruleForm.payee.trim();
    if (
      !payee ||
      (ruleForm.payoutMethod === "percentage" && (ruleForm.percentage < 0 || ruleForm.percentage > 100)) ||
      (ruleForm.payoutMethod === "surgeon_fee" && ruleForm.surgeonFee <= 0)
    ) {
      setMessage("Enter a payee and a valid percentage or surgeon fee.");
      return;
    }
    const nextRule = { ...ruleForm, payee };
    saveRules([...rules.filter((rule) => rule.id !== nextRule.id), nextRule]);
    setRuleModalOpen(false);
    setMessage(`Reconciliation agreement saved for ${payee}.`);
  };
  const attachMou = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setRuleForm((current) => ({
      ...current,
      mouFileName: file.name,
      mouUploadedAt: new Date().toISOString(),
    }));
    setMessage("MOU document attached. Enter the agreement terms manually, then save.");
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const rows = await importReconciliationFile(file);
      const additions = rows.map(
        (row, index): Payable => {
          const matchingRules = rules.filter(
            (rule) =>
              rule.payee.trim().toLowerCase() === row.payee.trim().toLowerCase() &&
              rule.role.toLowerCase() === row.type.toLowerCase(),
          );
          const importedPatientSource = row.patientSource.toLowerCase().includes("doctor")
            ? "doctor_patient"
            : "hospital_patient";
          const matchingRule = row.patientSource
            ? matchingRules.find(
                (rule) => rule.patientSource === importedPatientSource,
              )
            : matchingRules[0];
          const percentage = matchingRule?.percentage ?? 20;
          const excludedCosts =
            (matchingRule?.deductExternalLab ?? true ? row.externalLab : 0) +
            (matchingRule?.deductImplant ?? true ? row.implant : 0) +
            (matchingRule?.deductDci ? row.dci : 0) +
            (matchingRule?.deductCrossConsultation ? row.crossConsultation : 0) +
            (matchingRule?.deductReferralCommission ? row.referralCommission : 0) +
            (matchingRule?.deductExternalDiagnostics ? row.externalDiagnostics : 0) +
            (matchingRule?.deductAnaesthetist ? row.anaesthetist : 0) +
            (matchingRule?.deductConsumables ? row.consumables : 0) +
            (matchingRule?.deductSpecialEquipment ? row.specialEquipment : 0) +
            (matchingRule?.deductExternalVisit ? row.externalVisit : 0);
          const eligibleRevenue = Math.max(0, row.surgeryAmount - excludedCosts);
          return {
            id: `PAY-${Date.now().toString().slice(-6)}-${index + 1}`,
            payee: row.payee,
            type: row.type,
            caseRef: row.caseRef,
            gross: matchingRule?.payoutMethod === "surgeon_fee"
              ? matchingRule.surgeonFee
              : eligibleRevenue * (percentage / 100),
            eligibleRevenue,
            excludedCosts,
            percentage,
            tds: 0,
            status: "approved",
            bank: "Bank details pending",
          };
        },
      );
      savePayables([...additions, ...payables]);
      setActiveTab("queue");
      setMessage(
        `${additions.length} payout${additions.length === 1 ? "" : "s"} calculated from each payee's agreement and added to Monday's queue.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not import this file.",
      );
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <main>
      <section className="finance-hero">
        <div>
          <p className="eyebrow">Finance workspace</p>
          <h1>Hospital reconciliation</h1>
          <p>
            Review payables, approve the Monday payment batch, and keep doctor,
            partner, vendor, rental, implant, and lab payments traceable.
          </p>
        </div>
        <div className="finance-import">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={importFile}
            hidden
          />
          <button
            className="primary"
            disabled={importing}
            onClick={() => inputRef.current?.click()}
          >
            {importing ? "Importing…" : "Import Excel"}
          </button>
          <small>Agreement-based payout → Monday queue</small>
        </div>
      </section>

      <nav className="finance-tabs" aria-label="Finance workspace">
        <button
          className={activeTab === "dashboard" ? "active" : ""}
          onClick={() => setActiveTab("dashboard")}
        >
          Overview
        </button>
        <button
          className={activeTab === "queue" ? "active" : ""}
          onClick={() => setActiveTab("queue")}
        >
          Payment queue
        </button>
        <button
          className={activeTab === "agreements" ? "active" : ""}
          onClick={() => setActiveTab("agreements")}
        >
          MOU agreements
        </button>
        <button
          className={activeTab === "history" ? "active" : ""}
          onClick={() => setActiveTab("history")}
        >
          Payment history
        </button>
        <button
          className={activeTab === "bank" ? "active" : ""}
          onClick={() => setActiveTab("bank")}
        >
          Bank details
        </button>
      </nav>

      {activeTab === "dashboard" && (
        <>
          <div className="finance-metrics">
            <Metric
              label="Awaiting approval"
              value={money(totals.submitted)}
              caption="Submitted payables"
            />
            <Metric
              label="Monday payment run"
              value={money(totals.approved)}
              caption="Approved for payment"
            />
            <Metric
              label="Paid this week"
              value={money(totals.paid)}
              caption="Confirmed payments"
            />
            <Metric
              label="TDS tracked"
              value={money(payables.reduce((sum, item) => sum + item.tds, 0))}
              caption="Across current payables"
            />
          </div>
          <section className="card">
            <div className="section-title">
              <div>
                <h1>Monday payment checklist</h1>
                <p className="form-help">
                  Import Case Reference, Payee, Type, and Surgery Amount. Add
                  optional Patient Source (Doctor or Hospital), DCI, Cross Consultation, Referral Commission,
                  External Diagnostics, Anaesthetist, Consumables, Special Equipment,
                  External Visit, External Lab, and Implant columns. The selected
                  MOU rule removes only its configured deductions before sharing.
                </p>
              </div>
              <span className="source-badge">Next run: Monday</span>
            </div>
            <ol className="checklist">
              <li>Import the completed expense and surgery workbook.</li>
              <li>Review the agreement-based payout and its eligible revenue.</li>
              <li>Verify bank details and TDS, then mark payments as paid.</li>
            </ol>
            {message && <p className="status">{message}</p>}
          </section>
        </>
      )}

      {activeTab === "queue" && (
        <section className="card">
          <div className="section-title">
            <div>
              <h1>Payment queue</h1>
              <p className="form-help">
                Only unpaid items are shown. Click a name to see each surgery
                and role.
              </p>
            </div>
            <span className="source-badge">
              {money(totals.submitted + totals.approved)} unpaid total
            </span>
          </div>
          <div className="payable-list">
            {unpaidPayableGroups.length ? (
              unpaidPayableGroups.map((group) => (
                <article className="payable payable-group" key={group.key}>
                  <div>
                    <button
                      className="payee-toggle"
                      onClick={() => togglePayee(group.key)}
                      aria-expanded={expandedPayees.includes(group.key)}
                    >
                      <strong>{group.payee}</strong>
                      <span>
                        {expandedPayees.includes(group.key) ? "Hide" : "Show"}{" "}
                        {group.items.length}{" "}
                        {group.items.length === 1 ? "surgery" : "surgeries"}
                      </span>
                    </button>
                    {expandedPayees.includes(group.key) && (
                      <div className="surgery-popout">
                        {group.items.map((item) => (
                          <div key={item.id}>
                            <span>
                              {item.caseRef} · {item.type}
                            </span>
                            <b>{money(item.gross - item.tds)}</b>
                            <small>
                              {item.percentage ?? 20}% of {money(item.eligibleRevenue ?? 0)} eligible revenue · {item.status}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="payable-amount">
                    <b>{money(group.gross - group.tds)}</b>
                    <span>
                      {group.items.length} surgery payout
                      {group.items.length === 1 ? "" : "s"} · TDS{" "}
                      {money(group.tds)}
                    </span>
                  </div>
                  <div className="payable-actions">
                    <em className={`payment-status ${group.status}`}>
                      {group.status.replace("_", " ")}
                    </em>
                    {group.status === "submitted" && (
                      <button
                        onClick={() =>
                          changeGroupStatus(group.items, "approved")
                        }
                      >
                        Approve
                      </button>
                    )}
                    {group.status === "approved" && (
                      <button
                        className="primary"
                        onClick={() => changeGroupStatus(group.items, "paid")}
                      >
                        Mark paid
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="form-help">
                No unpaid payments. View completed surgery payments in Payment
                history.
              </p>
            )}
          </div>
          {message && <p className="status">{message}</p>}
        </section>
      )}

      {activeTab === "agreements" && (
        <section className="card">
          <div className="section-title">
            <div>
              <h1>Doctor & referral MOU agreements</h1>
              <p className="form-help">
                Record each doctor’s MOU exactly: patient source, revenue basis, deductions, OPD share, rental, visit charges, fixed monthly amount, and payment terms.
              </p>
            </div>
            <button className="primary" onClick={() => openRule()}>
              Add agreement
            </button>
          </div>
          <div className="agreement-list">
            {rules.length ? rules.map((rule) => (
              <article className="agreement-row" key={rule.id}>
                <div>
                  <strong>{rule.payee}</strong>
                  <span>{rule.role} · {rule.patientSource === "doctor_patient" ? "Doctor’s patient" : "Hospital’s patient"} · {rule.payoutMethod === "surgeon_fee" ? `Surgeon fee ${money(rule.surgeonFee)}` : `${rule.percentage}% of ${rule.revenueBasis.replace(/_/g, " ")}`}</span>
                  <small>
                    {rule.fixedMonthlyAmount ? `Fixed monthly ${money(rule.fixedMonthlyAmount)} · ` : ""}{rule.opdSharePercentage ? `OPD ${rule.opdSharePercentage}% · ` : ""}Exclusions recorded · {rule.mouFileName ? `MOU: ${rule.mouFileName}` : "Manual agreement"}
                    {rule.mouFileName ? ` · MOU: ${rule.mouFileName}` : " · Manual agreement"}
                  </small>
                </div>
                <button className="secondary" onClick={() => openRule(rule)}>Edit</button>
              </article>
            )) : (
              <p className="form-help">No agreements yet. Add the doctor or referral terms before importing cases.</p>
            )}
          </div>
          {ruleModalOpen && (
            <div className="modal-backdrop" role="presentation" onMouseDown={() => setRuleModalOpen(false)}>
              <section className="payee-modal" role="dialog" aria-modal="true" aria-label="Reconciliation agreement" onMouseDown={(event) => event.stopPropagation()}>
                <div className="section-title">
                  <div>
                    <h1>{ruleForm.payee ? `Agreement for ${ruleForm.payee}` : "New reconciliation agreement"}</h1>
                    <p className="form-help">Enter the agreement terms manually. You can attach an MOU file as a record.</p>
                  </div>
                  <button className="modal-close" onClick={() => setRuleModalOpen(false)} aria-label="Close">×</button>
                </div>
                <form onSubmit={saveRule}>
                  {message && <p className="status">{message}</p>}
                  <div className="two">
                    <label className="field"><span>Doctor / payee name</span><input required value={ruleForm.payee} onChange={(e) => setRuleForm((current) => ({ ...current, payee: e.target.value }))} placeholder="e.g. Dr Mehta" /></label>
                    <label className="field"><span>Payout role</span><select value={ruleForm.role} onChange={(e) => setRuleForm((current) => ({ ...current, role: e.target.value }))}><option>Doctor</option><option>Referral</option><option>Anaesthetist</option><option>Assistant Surgeon</option><option>Partner</option></select></label>
                    <label className="field"><span>Patient type & payout</span><select value={`${ruleForm.patientSource}:${ruleForm.payoutMethod}`} onChange={(e) => { const [patientSource, payoutMethod] = e.target.value.split(":") as [ReconciliationRule["patientSource"], ReconciliationRule["payoutMethod"]]; setRuleForm((current) => ({ ...current, patientSource, payoutMethod })); }}><option value="doctor_patient:percentage">Doctor’s patient — percentage after deductions</option><option value="hospital_patient:percentage">Hospital’s patient — percentage after deductions</option><option value="hospital_patient:surgeon_fee">Hospital’s patient — fixed surgeon fee</option></select></label>
                    <label className="field"><span>Revenue basis</span><select value={ruleForm.revenueBasis} onChange={(e) => setRuleForm((current) => ({ ...current, revenueBasis: e.target.value as ReconciliationRule["revenueBasis"] }))}><option value="billed">Gross billed amount</option><option value="settled_tpa">Settled TPA amount</option><option value="payment_received">Payment received</option><option value="remaining_amount">Remaining amount after deductions</option><option value="partner_commission">Partner commission</option><option value="fixed">Fixed amount</option></select></label>
                    {ruleForm.payoutMethod === "percentage" ? <label className="field"><span>IPD / revenue share percentage</span><div className="amount"><b>%</b><input required type="number" min="0" max="100" step="0.01" value={ruleForm.percentage} onChange={(e) => setRuleForm((current) => ({ ...current, percentage: Number(e.target.value) }))} /></div></label> : <label className="field"><span>Fixed surgeon fee per case</span><div className="amount"><b>₹</b><input required type="number" min="0" value={ruleForm.surgeonFee || ""} onChange={(e) => setRuleForm((current) => ({ ...current, surgeonFee: Number(e.target.value) }))} /></div></label>}
                    <div className="mou-upload"><span>MOU document <em>optional record</em></span><input ref={mouInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={attachMou} /><small>{ruleForm.mouFileName ? `Attached: ${ruleForm.mouFileName}` : "Attach a PDF or image for the agreement record."}</small></div>
                  </div>
                  <h2>Revenue deductions before this share</h2>
                  <div className="exclusion-checks">
                    <label><input type="checkbox" checked={ruleForm.deductDci} onChange={(e) => setRuleForm((current) => ({ ...current, deductDci: e.target.checked }))} /> Deduct DCI</label>
                    <label><input type="checkbox" checked={ruleForm.deductCrossConsultation} onChange={(e) => setRuleForm((current) => ({ ...current, deductCrossConsultation: e.target.checked }))} /> Deduct cross-consultation</label>
                    <label><input type="checkbox" checked={ruleForm.deductReferralCommission} onChange={(e) => setRuleForm((current) => ({ ...current, deductReferralCommission: e.target.checked }))} /> Deduct referral commission</label>
                    <label><input type="checkbox" checked={ruleForm.deductExternalLab} onChange={(e) => setRuleForm((current) => ({ ...current, deductExternalLab: e.target.checked }))} /> Deduct external lab from total revenue</label>
                    <label><input type="checkbox" checked={ruleForm.deductExternalDiagnostics} onChange={(e) => setRuleForm((current) => ({ ...current, deductExternalDiagnostics: e.target.checked }))} /> Deduct external diagnostics / ultrasound</label>
                    <label><input type="checkbox" checked={ruleForm.deductAnaesthetist} onChange={(e) => setRuleForm((current) => ({ ...current, deductAnaesthetist: e.target.checked }))} /> Deduct anaesthetist cost</label>
                    <label><input type="checkbox" checked={ruleForm.deductConsumables} onChange={(e) => setRuleForm((current) => ({ ...current, deductConsumables: e.target.checked }))} /> Deduct consumables</label>
                    <label><input type="checkbox" checked={ruleForm.deductSpecialEquipment} onChange={(e) => setRuleForm((current) => ({ ...current, deductSpecialEquipment: e.target.checked }))} /> Deduct special rented equipment</label>
                    <label><input type="checkbox" checked={ruleForm.deductExternalVisit} onChange={(e) => setRuleForm((current) => ({ ...current, deductExternalVisit: e.target.checked }))} /> Deduct external doctor visit cost</label>
                    <label><input type="checkbox" checked={ruleForm.deductImplant} onChange={(e) => setRuleForm((current) => ({ ...current, deductImplant: e.target.checked }))} /> Deduct implant from total revenue</label>
                  </div>
                  <h2>OPD, fixed and payment terms</h2>
                  <div className="three">
                    <label className="field"><span>OPD share percentage</span><div className="amount"><b>%</b><input type="number" min="0" max="100" value={ruleForm.opdSharePercentage || ""} onChange={(e) => setRuleForm((current) => ({ ...current, opdSharePercentage: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>OPD price / visit</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.opdPrice || ""} onChange={(e) => setRuleForm((current) => ({ ...current, opdPrice: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>Fixed rental / month</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.fixedRental || ""} onChange={(e) => setRuleForm((current) => ({ ...current, fixedRental: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>Fixed monthly payment</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.fixedMonthlyAmount || ""} onChange={(e) => setRuleForm((current) => ({ ...current, fixedMonthlyAmount: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>Ward / day visit charge</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.wardVisitCharge || ""} onChange={(e) => setRuleForm((current) => ({ ...current, wardVisitCharge: Number(e.target.value) }))} /></div></label>
                    <label className="field"><span>ICU / emergency visit charge</span><div className="amount"><b>₹</b><input type="number" min="0" value={ruleForm.icuEmergencyVisitCharge || ""} onChange={(e) => setRuleForm((current) => ({ ...current, icuEmergencyVisitCharge: Number(e.target.value) }))} /></div></label>
                  </div>
                  <div className="two">
                    <label className="field"><span>Payment timing</span><input value={ruleForm.paymentTerms} onChange={(e) => setRuleForm((current) => ({ ...current, paymentTerms: e.target.value }))} placeholder="e.g. Within 48 hours of surgery / 5th of following month" /></label>
                    <label className="field"><span>Other MOU notes</span><input value={ruleForm.notes} onChange={(e) => setRuleForm((current) => ({ ...current, notes: e.target.value }))} placeholder="e.g. 20 OT/month, ₹3,000/OT after 20" /></label>
                    <label className="field"><span>Effective from <em>optional</em></span><input type="date" value={ruleForm.effectiveFrom} onChange={(e) => setRuleForm((current) => ({ ...current, effectiveFrom: e.target.value }))} /></label>
                    <label className="field"><span>Effective to <em>optional</em></span><input type="date" value={ruleForm.effectiveTo} onChange={(e) => setRuleForm((current) => ({ ...current, effectiveTo: e.target.value }))} /></label>
                  </div>
                  <button className="primary">Save agreement</button><button type="button" className="secondary" onClick={() => setRuleModalOpen(false)}>Cancel</button>
                </form>
              </section>
            </div>
          )}
        </section>
      )}

      {activeTab === "history" && (
        <section className="card">
          <div className="section-title">
            <div>
              <h1>Payment history</h1>
              <p className="form-help">
                Completed payments, shown surgery-by-surgery.
              </p>
            </div>
            <span className="source-badge">
              {money(totals.paid)} paid total
            </span>
          </div>
          <div className="history-list">
            {payables.filter((item) => item.status === "paid").length ? (
              payables
                .filter((item) => item.status === "paid")
                .map((item) => (
                  <article className="history-payment" key={item.id}>
                    <div>
                      <strong>{item.caseRef}</strong>
                      <span>
                        {item.payee} · {item.type}
                      </span>
                    </div>
                    <b>{money(item.gross - item.tds)}</b>
                  </article>
                ))
            ) : (
              <p className="form-help">
                No payments have been marked as paid yet.
              </p>
            )}
          </div>
        </section>
      )}

      {activeTab === "bank" && (
        <section className="card bank-card">
          <div className="section-title">
            <div>
              <h1>Vendor & payee directory</h1>
              <p className="form-help">
                Tap a name to add or edit verified PAN and bank details.
              </p>
            </div>
            <span className="source-badge">
              {vendorDirectory.length} payees
            </span>
          </div>
          <div className="vendor-directory">
            {vendorDirectory.length ? (
              vendorDirectory.map((item) => (
                <button
                  key={item.name}
                  className="vendor-row"
                  onClick={() => editPayee(item.name, item.category)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.category}</small>
                  </span>
                  <span>
                    {item.profile?.pan
                      ? `PAN ${item.profile.pan}`
                      : "Details pending"}
                  </span>
                </button>
              ))
            ) : (
              <p className="form-help">
                Import a reconciliation file or add a vendor.
              </p>
            )}
          </div>
          <button className="secondary add-payee" onClick={addPayee}>
            Add vendor / payee
          </button>
          {message && <p className="status">{message}</p>}
          {payeeModalOpen && (
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={() => setPayeeModalOpen(false)}
            >
              <section
                className="payee-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Payee details"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="section-title">
                  <div>
                    <h1>
                      {payeeForm.name
                        ? `Details for ${payeeForm.name}`
                        : "Add vendor / payee"}
                    </h1>
                    <p className="form-help">
                      Store verified PAN and bank details before payment.
                    </p>
                  </div>
                  <button
                    className="modal-close"
                    onClick={() => setPayeeModalOpen(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={savePayeeProfile}>
                  <div className="two">
                    <label className="field">
                      <span>Name</span>
                      <input
                        required
                        value={payeeForm.name}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            name: e.target.value,
                          }))
                        }
                        placeholder="Payee legal name"
                      />
                    </label>
                    <label className="field">
                      <span>Role / category</span>
                      <select
                        value={payeeForm.category}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            category: e.target.value,
                          }))
                        }
                      >
                        <option>Doctor</option>
                        <option>Referral</option>
                        <option>Anaesthetist</option>
                        <option>Partner</option>
                        <option>Vendor</option>
                        <option>Lab</option>
                        <option>Rental</option>
                        <option>Implant</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>PAN number</span>
                      <input
                        value={payeeForm.pan}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            pan: e.target.value,
                          }))
                        }
                        maxLength={10}
                        placeholder="ABCDE1234F"
                      />
                    </label>
                    <label className="field">
                      <span>Account holder</span>
                      <input
                        value={payeeForm.accountHolder}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            accountHolder: e.target.value,
                          }))
                        }
                        placeholder="Legal account name"
                      />
                    </label>
                    <label className="field">
                      <span>Account number</span>
                      <input
                        value={payeeForm.accountNumber}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            accountNumber: e.target.value,
                          }))
                        }
                        inputMode="numeric"
                        placeholder="Bank account number"
                      />
                    </label>
                    <label className="field">
                      <span>IFSC code</span>
                      <input
                        value={payeeForm.ifsc}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            ifsc: e.target.value,
                          }))
                        }
                        placeholder="e.g. HDFC0001234"
                      />
                    </label>
                    <label className="field">
                      <span>
                        UPI ID <em>optional</em>
                      </span>
                      <input
                        value={payeeForm.upi}
                        onChange={(e) =>
                          setPayeeForm((current) => ({
                            ...current,
                            upi: e.target.value,
                          }))
                        }
                        placeholder="name@bank"
                      />
                    </label>
                  </div>
                  <button className="primary">Save details</button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPayeeModalOpen(false)}
                  >
                    Cancel
                  </button>
                </form>
              </section>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <section className="finance-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </section>
  );
}

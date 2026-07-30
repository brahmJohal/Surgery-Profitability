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
    "dashboard" | "queue" | "history" | "bank"
  >("dashboard");
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [expandedPayees, setExpandedPayees] = useState<string[]>([]);
  const [payeeProfiles, setPayeeProfiles] =
    useState<PayeeProfile[]>(savedPayeeProfiles);
  const [payeeForm, setPayeeForm] = useState<PayeeProfile>(emptyPayeeProfile);
  const [payeeModalOpen, setPayeeModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const savePayables = (next: Payable[]) => {
    setPayables(next);
    localStorage.setItem("financePayables", JSON.stringify(next));
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

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const rows = await importReconciliationFile(file);
      const additions = rows.map(
        (row, index): Payable => ({
          id: `PAY-${Date.now().toString().slice(-6)}-${index + 1}`,
          payee: row.payee,
          type: row.type,
          caseRef: row.caseRef,
          gross: row.surgeryAmount * 0.2,
          tds: 0,
          status: "approved",
          bank: "Bank details pending",
        }),
      );
      savePayables([...additions, ...payables]);
      setActiveTab("queue");
      setMessage(
        `${additions.length} payout${additions.length === 1 ? "" : "s"} calculated at 20% and added to Monday's queue.`,
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
          <small>20% payout → Monday queue</small>
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
                  Import an Excel file with Case Reference, Payee, Type (Doctor
                  or Referral), and Surgery Amount. The payout is automatically
                  20% of surgery amount.
                </p>
              </div>
              <span className="source-badge">Next run: Monday</span>
            </div>
            <ol className="checklist">
              <li>Import the completed expense and surgery workbook.</li>
              <li>Review the automatically calculated 20% payouts.</li>
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
                            <small>{item.status}</small>
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

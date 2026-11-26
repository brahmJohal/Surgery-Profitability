import { useMemo, useState } from "react";
import { csvRows } from "../lib/excelImport";

type Lead = Record<string, string>;
const required = ["Lead ID", "Status", "Sub-status", "Owner"];
const normal = (value: string | undefined) => (value || "").trim().toUpperCase();
const labels: Record<string, string> = { NEW: "New", CONTACTED: "Contacted", INTERESTED: "Interested", FOLLOW_UP: "Follow-up", CONVERTED: "Converted", CLOSED: "Closed", LOST: "Lost" };
const booked = (row: Lead) => normal(row.Status) === "CONVERTED" && normal(row["Sub-status"]) === "OPD_BOOKED";
const visited = (row: Lead) => normal(row.Status) === "CONVERTED" && normal(row["Sub-status"]) === "OPD_VISITED";
const treated = (row: Lead) => normal(row.Status) === "CLOSED" && normal(row["Sub-status"]) === "SUCCESSFULLY_TREATED";
const percent = (n: number, total: number) => total ? `${(100 * n / total).toFixed(1)}%` : "—";
const readable = (value: string) => value ? value.replace(/_/g, " ") : "Not specified";

export function AnalystDashboard() {
  const [filename, setFilename] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState("");
  const [popup, setPopup] = useState<{ title: string; leads: Lead[] } | null>(null);
  const loadLeads = async (file?: File) => {
    if (!file) return;
    try {
      const rows = csvRows((await file.text()).replace(/^\uFEFF/, ""));
      const headers = rows.shift()?.map((value) => value.trim()) || [];
      const missing = required.filter((value) => !headers.includes(value));
      if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);
      const parsed = rows.map((values) => Object.fromEntries(headers.map((key, index) => [key, values[index] || ""])));
      setFilename(file.name); setLeads(parsed); setPopup(null); setError("");
    } catch (e) {
      setFilename(""); setLeads([]); setPopup(null);
      setError(e instanceof Error ? e.message : "Could not read this file.");
    }
  };
  const report = useMemo(() => {
    const groups = new Map<string, Lead[]>();
    const statuses = new Map<string, Lead[]>();
    for (const row of leads) {
      const owner = row.Owner?.trim() || "Unassigned";
      groups.set(owner, [...(groups.get(owner) || []), row]);
      const key = `${normal(row.Status) || "UNKNOWN"}|${normal(row["Sub-status"])}`;
      statuses.set(key, [...(statuses.get(key) || []), row]);
    }
    return { groups, statuses };
  }, [leads]);
  const countButton = (title: string, rows: Lead[]) => <button type="button" className="analyst-count" disabled={!rows.length} onClick={() => setPopup({ title, leads: rows })}>{rows.length.toLocaleString()}</button>;
  const bookedRows = leads.filter(booked), visitedRows = leads.filter(visited), treatedRows = leads.filter(treated);
  return <main>
    <section className="card"><h1>Sales analyst dashboard</h1>
      <p>Upload a lead dump CSV. Data stays in this browser session and is not saved or shared.</p>
      <label className="field"><span>Lead dump CSV</span><input type="file" accept=".csv,text/csv" onChange={(event) => void loadLeads(event.target.files?.[0])} /></label>
      {filename && <p>{filename} — {leads.length.toLocaleString()} lead rows loaded.</p>}{error && <p role="alert">{error}</p>}
      <p className="form-help">Each uploaded row is a lead. Ideal L2O = currently OPD booked ÷ lead rows; real L2O = currently OPD visited ÷ lead rows. IPD done = CLOSED + SUCCESSFULLY_TREATED. Current statuses are separate snapshots: previous OPD visits cannot be recovered from them. CASE_COMPLETED is listed separately until its meaning is confirmed. Rates depend on the file's date range and are not cohort-adjusted.</p>
    </section>
    {filename && <><section className="card analyst-section"><h2>Overall performance</h2><div className="analyst-scroll"><table><thead><tr><th>Total leads</th><th>OPD booked</th><th>Ideal L2O</th><th>OPD visited</th><th>Real L2O</th><th>IPD done</th></tr></thead><tbody><tr><td>{countButton("All leads", leads)}</td><td>{countButton("OPD booked", bookedRows)}</td><td>{percent(bookedRows.length, leads.length)}</td><td>{countButton("OPD visited", visitedRows)}</td><td>{percent(visitedRows.length, leads.length)}</td><td>{countButton("IPD done", treatedRows)}</td></tr></tbody></table></div></section>
    <section className="card analyst-section"><h2>BD performance</h2><div className="analyst-scroll"><table><thead><tr><th>BD</th><th>Leads</th><th>OPD booked</th><th>Ideal L2O</th><th>OPD visited</th><th>Real L2O</th><th>IPD done</th></tr></thead><tbody>{[...report.groups].sort((a,b) => a[0].localeCompare(b[0])).map(([owner, rows]) => { const b = rows.filter(booked), v = rows.filter(visited), i = rows.filter(treated); return <tr key={owner}><td>{owner}</td><td>{countButton(`${owner} — leads`, rows)}</td><td>{countButton(`${owner} — OPD booked`, b)}</td><td>{percent(b.length, rows.length)}</td><td>{countButton(`${owner} — OPD visited`, v)}</td><td>{percent(v.length, rows.length)}</td><td>{countButton(`${owner} — IPD done`, i)}</td></tr>; })}</tbody></table></div></section>
    <section className="card analyst-section"><h2>Status and sub-status</h2><div className="analyst-scroll"><table><thead><tr><th>Status</th><th>Sub-status</th><th>Leads</th></tr></thead><tbody>{[...report.statuses].sort((a,b) => a[0].localeCompare(b[0])).map(([key, rows]) => { const [status, sub] = key.split("|"); return <tr key={key}><td>{labels[status] || readable(status)}</td><td>{readable(sub)}</td><td>{countButton(`${readable(status)} — ${readable(sub)}`, rows)}</td></tr>; })}</tbody></table></div></section></>}
    {popup && <div className="modal-backdrop" onMouseDown={() => setPopup(null)}><section className="payee-modal analyst-patient-modal" role="dialog" aria-modal="true" aria-label={popup.title} onMouseDown={(e) => e.stopPropagation()}><div className="section-title"><h1>{popup.title}</h1><button type="button" className="modal-close" aria-label="Close" onClick={() => setPopup(null)}>×</button></div><div className="analyst-scroll"><table><thead><tr><th>Lead ID</th><th>Patient name</th><th>BD</th><th>Status</th><th>Sub-status</th></tr></thead><tbody>{popup.leads.map((row, index) => <tr key={`${row["Lead ID"]}-${index}`}><td>{row["Lead ID"] || "—"}</td><td>{row["Patient Name"] || "—"}</td><td>{row.Owner || "—"}</td><td>{readable(row.Status)}</td><td>{readable(row["Sub-status"])}</td></tr>)}</tbody></table></div></section></div>}
  </main>;
}

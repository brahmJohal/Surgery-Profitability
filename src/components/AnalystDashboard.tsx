import { useMemo, useState } from "react";
import { csvRows } from "../lib/excelImport";
import { money } from "../lib/money";

type Row = Record<string, string>;
type Kind = "leads" | "opd" | "ipd";
type Files = Record<Kind, Row[]>;
const columns: Record<Kind, string[]> = {
  leads: ["Lead ID", "Phone", "Owner", "Campaign", "Created At"],
  opd: ["UHID NO", "Mobile number", "Doctor NAME", "Total", "DATE"],
  ipd: ["ipdNumber", "uhid", "patientPhone", "doctorName", "surgeryNames", "admissionDate"],
};
const phone = (s: string) => { const d = (s || "").replace(/\D/g, ""); return d.length === 10 ? d : d.length === 12 && d.startsWith("91") ? d.slice(2) : ""; };
const date = (s: string) => {
  const m = (s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s*[—-]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
  let hour = m?.[4] ? Number(m[4]) : 0;
  if (m?.[7]) hour = hour % 12 + (m[7].toLowerCase() === "pm" ? 12 : 0);
  const v = m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${String(hour).padStart(2, "0")}:${m[5] || "00"}:${m[6] || "00"}+05:30`).getTime() : Date.parse(s);
  return Number.isFinite(v) ? v : NaN;
};
const patient = (uhid: string, mobile: string) => uhid.trim() ? `u:${uhid.trim().toLowerCase()}` : phone(mobile) ? `p:${phone(mobile)}` : "";
const pct = (a: number, b: number) => b ? `${(a * 100 / b).toFixed(1)}%` : "—";
type Group = { leads: Set<string>; opd: Set<string>; ipd: Set<string>; opdLeads: Set<string>; ipdLeads: Set<string>; opdToIpd: Set<string>; revenue: number };
const blank = (): Group => ({ leads: new Set(), opd: new Set(), ipd: new Set(), opdLeads: new Set(), ipdLeads: new Set(), opdToIpd: new Set(), revenue: 0 });
const leadId = (l: Row) => l["Lead ID"] || `${phone(l.Phone)}:${l["Created At"]}`;

export function AnalystDashboard() {
  const [files, setFiles] = useState<Files>({ leads: [], opd: [], ipd: [] });
  const [names, setNames] = useState<Record<Kind, string>>({ leads: "", opd: "", ipd: "" });
  const [error, setError] = useState("");
  const load = async (kind: Kind, file?: File) => {
    if (!file) return;
    try {
      const rows = csvRows((await file.text()).replace(/^\uFEFF/, ""));
      const headers = rows.shift()?.map((v) => v.trim()) || [];
      const missing = columns[kind].filter((key) => !headers.includes(key));
      if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);
      const data = rows.map((values) => Object.fromEntries(headers.map((key, i) => [key, values[i] || ""])));
      setFiles((current) => ({ ...current, [kind]: data }));
      setNames((current) => ({ ...current, [kind]: file.name }));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read this file."); }
  };
  const report = useMemo(() => {
    const bd = new Map<string, Group>(), campaign = new Map<string, Group>(), doctor = new Map<string, Group>(), surgery = new Map<string, Group>();
    const get = (map: Map<string, Group>, name: string) => { const k = name.trim() || "Unassigned"; if (!map.has(k)) map.set(k, blank()); return map.get(k)!; };
    const leads = files.leads.filter((r) => phone(r.Phone) && Number.isFinite(date(r["Created At"])));
    const byPhone = new Map<string, Row[]>();
    for (const l of leads) { const p = phone(l.Phone); byPhone.set(p, [...(byPhone.get(p) || []), l]); }
    for (const list of byPhone.values()) list.sort ( (a, b) => date(b["Created At"]) - date(a["Created At"]) );
    const latest = (p: string, when: number) => Number.isFinite(when) ? byPhone.get(phone(p))?.find((l) => date(l["Created At"]) <= when) : undefined;
    for (const l of leads) { const id = leadId(l); get(bd, l.Owner).leads.add(id); get(campaign, l.Campaign || l["Meta/Google Campaign"]).leads.add(id); }
    const opdFirst = new Map<string, number>();
    for (const r of files.opd) { const id = patient(r["UHID NO"], r["Mobile number"]), t = date(r.DATE); if (id && Number.isFinite(t)) opdFirst.set(id, Math.min(opdFirst.get(id) ?? Infinity, t)); }
    let unmatchedOpd = 0, unmatchedIpd = 0;
    for (const r of files.opd) {
      const id = patient(r["UHID NO"], r["Mobile number"]), t = date(r.DATE); if (!id || !Number.isFinite(t)) { unmatchedOpd++; continue; }
      const l = latest(r["Mobile number"], t), amount = Number((r.Total || "0").replace(/[,₹\s]/g, ""));
      const groups = [get(doctor, r["Doctor NAME"])];
      if (l) { const b = get(bd, l.Owner), c = get(campaign, l.Campaign || l["Meta/Google Campaign"]); b.opdLeads.add(leadId(l)); c.opdLeads.add(leadId(l)); groups.push(b, c); } else unmatchedOpd++;
      groups.forEach((g) => { g.opd.add(id); if (Number.isFinite(amount)) g.revenue += amount; });
    }
    for (const r of files.ipd) {
      const id = patient(r.uhid, r.patientPhone), t = date(r.admissionDate); if (!id || !Number.isFinite(t)) { unmatchedIpd++; continue; }
      const l = latest(r.patientPhone, t), groups = [get(doctor, r.doctorName), get(surgery, r.surgeryNames)];
      if (l) { const b = get(bd, l.Owner), c = get(campaign, l.Campaign || l["Meta/Google Campaign"]); b.ipdLeads.add(leadId(l)); c.ipdLeads.add(leadId(l)); groups.push(b, c); } else unmatchedIpd++;
      groups.forEach((g) => { g.ipd.add(id); if ((opdFirst.get(id) ?? Infinity) <= t) g.opdToIpd.add(id); });
    }
    return { bd, campaign, doctor, surgery, unmatchedOpd, unmatchedIpd, validLeads: leads.length };
  }, [files]);
  const table = (title: string, data: Map<string, Group>, conversions: boolean) => <section className="card analyst-section"><h2>{title}</h2><div className="analyst-scroll"><table><thead><tr><th>Name</th>{conversions && <th>Leads</th>}<th>OPD patients</th><th>IPD patients</th>{conversions && <><th>L2O</th><th>L2I</th></>}<th>O2I</th><th>OPD revenue</th></tr></thead><tbody>{[...data].sort((a,b) => a[0].localeCompare(b[0])).map(([name,g]) => <tr key={name}><td>{name}</td>{conversions && <td>{g.leads.size}</td>}<td>{g.opd.size}</td><td>{g.ipd.size}</td>{conversions && <><td>{pct(g.opdLeads.size,g.leads.size)}</td><td>{pct(g.ipdLeads.size,g.leads.size)}</td></>}<td>{pct([...g.opdToIpd].filter((id) => g.opd.has(id)).length,g.opd.size)}</td><td>{money(g.revenue)}</td></tr>)}</tbody></table></div></section>;
  return <main><section className="card"><h1>Sales analyst dashboard</h1><p>Upload the three CSV exports. Files stay in this browser session and are not shared or saved.</p><div className="analyst-uploads">{(["leads", "opd", "ipd"] as Kind[]).map((kind) => <label className="field" key={kind}><span>{kind.toUpperCase()} CSV</span><input type="file" accept=".csv,text/csv" onChange={(e) => void load(kind,e.target.files?.[0])} /><small>{names[kind] || "Not uploaded"}</small></label>)}</div>{error && <p role="alert">{error}</p>}<p className="form-help">Counts use distinct UHID, or phone when UHID is missing. Lead attribution uses the most recent matching phone number before the visit. OPD revenue sums the Total column. Review shared phone numbers manually; matching is not proof of identity.</p><p className="form-help">Unmatched OPD lines: {report.unmatchedOpd} · Unmatched IPD rows: {report.unmatchedIpd} · Leads with usable phone and date: {report.validLeads}. Results depend on the dates covered by each file; conversion rates are not cohort-adjusted.</p></section>{table("BD performance", report.bd, true)}{table("Campaign performance", report.campaign, true)}{table("Doctor performance", report.doctor, false)}{table("Surgery performance", report.surgery, false)}</main>;
}

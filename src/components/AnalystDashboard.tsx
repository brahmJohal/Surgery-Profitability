import { useMemo, useState } from "react";
import { csvRows } from "../lib/excelImport";
import { LeadTrendCharts } from "./LeadTrendCharts";

type Lead = Record<string, string>;
const required = [
  "Lead ID",
  "Status",
  "Sub-status",
  "Owner",
  "Phone",
  "Created At",
];
const phoneKey = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10
    ? digits
    : digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : "";
};
const normal = (value: string | undefined) =>
  (value || "").trim().toUpperCase();
const labels: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  FOLLOW_UP: "Follow-up",
  CONVERTED: "Converted",
  CLOSED: "Closed",
  LOST: "Lost",
};
const booked = (row: Lead) =>
  normal(row.Status) === "CONVERTED" &&
  normal(row["Sub-status"]) === "OPD_BOOKED";
const visited = (row: Lead) =>
  normal(row.Status) === "CONVERTED" &&
  normal(row["Sub-status"]) === "OPD_VISITED";
const treated = (row: Lead) =>
  normal(row.Status) === "CLOSED" &&
  normal(row["Sub-status"]) === "SUCCESSFULLY_TREATED";
const interested = (row: Lead) => normal(row.Status) === "INTERESTED";
const converted = (row: Lead) => normal(row.Status) === "CONVERTED";
const good = (row: Lead) => interested(row) || converted(row);
const percent = (n: number, total: number) =>
  total ? `${((100 * n) / total).toFixed(1)}%` : "—";
const readable = (value: string) =>
  value ? value.replace(/_/g, " ") : "Not specified";

export function AnalystDashboard() {
  const [filename, setFilename] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState(0);
  const [missingDates, setMissingDates] = useState(0);
  const [selectedBd, setSelectedBd] = useState("");
  const [windowDays, setWindowDays] = useState<7 | 14 | 30>(14);
  const [minimum, setMinimum] = useState(0);
  const [popup, setPopup] = useState<{ title: string; leads: Lead[] } | null>(
    null,
  );
  const loadLeads = async (file?: File) => {
    if (!file) return;
    try {
      const rows = csvRows((await file.text()).replace(/^\uFEFF/, ""));
      const headers = rows.shift()?.map((value) => value.trim()) || [];
      const missing = required.filter((value) => !headers.includes(value));
      if (missing.length)
        throw new Error(`Missing columns: ${missing.join(", ")}`);
      const parsed = rows.map((values) =>
        Object.fromEntries(
          headers.map((key, index) => [key, values[index] || ""]),
        ),
      );
      const unique = new Map<string, Lead>();
      parsed.forEach((row, index) => {
        const phone = phoneKey(row.Phone);
        const key = phone ? `phone:${phone}` : `row:${index}`;
        const previous = unique.get(key);
        const timestamp = Date.parse(row["Created At"]);
        const previousTimestamp = previous
          ? Date.parse(previous["Created At"])
          : NaN;
        if (
          !previous ||
          (Number.isFinite(timestamp) &&
            (!Number.isFinite(previousTimestamp) ||
              timestamp > previousTimestamp))
        )
          unique.set(key, row);
      });
      setDuplicates(parsed.length - unique.size);
      setMissingDates(
        [...unique.values()].filter(
          (row) => !Number.isFinite(Date.parse(row["Created At"])),
        ).length,
      );
      setFilename(file.name);
      setLeads([...unique.values()]);
      setSelectedBd("");
      setPopup(null);
      setError("");
    } catch (e) {
      setFilename("");
      setLeads([]);
      setDuplicates(0);
      setMissingDates(0);
      setPopup(null);
      setError(e instanceof Error ? e.message : "Could not read this file.");
    }
  };
  const filteredLeads = useMemo(() => {
    const dates = leads
      .map((row) => Date.parse(row["Created At"]))
      .filter(Number.isFinite);
    if (!dates.length) return [];
    const endDay = Math.floor(
      dates.reduce((latest, value) => Math.max(latest, value), -Infinity) /
        86400000,
    );
    return leads.filter((row) => {
      const day = Math.floor(Date.parse(row["Created At"]) / 86400000);
      return Number.isFinite(day) && day <= endDay && day > endDay - windowDays;
    });
  }, [leads, windowDays]);
  const report = useMemo(() => {
    const groups = new Map<string, Lead[]>();
    const statuses = new Map<string, Lead[]>();
    for (const row of filteredLeads) {
      const owner = row.Owner?.trim() || "Unassigned";
      groups.set(owner, [...(groups.get(owner) || []), row]);
      const key = `${normal(row.Status) || "UNKNOWN"}|${normal(row["Sub-status"])}`;
      statuses.set(key, [...(statuses.get(key) || []), row]);
    }
    return { groups, statuses };
  }, [filteredLeads]);
  const countButton = (title: string, rows: Lead[]) => (
    <button
      type="button"
      className="analyst-count"
      disabled={!rows.length}
      onClick={() => setPopup({ title, leads: rows })}
    >
      {rows.length.toLocaleString()}
    </button>
  );
  const scopedLeads = selectedBd
    ? report.groups.get(selectedBd) || []
    : filteredLeads;
  const bdNames = [...new Set(leads.map((row) => row.Owner?.trim() || "Unassigned"))].sort((a, b) => a.localeCompare(b));
  const bookedRows = scopedLeads.filter(booked),
    visitedRows = scopedLeads.filter(visited),
    treatedRows = scopedLeads.filter(treated),
    interestedRows = scopedLeads.filter(interested),
    convertedRows = scopedLeads.filter(converted),
    goodRows = scopedLeads.filter(good);
  const chartLeads = selectedBd
    ? leads.filter((row) => (row.Owner?.trim() || "Unassigned") === selectedBd)
    : leads;
  return (
    <main className="analyst-dashboard sales-reference">
      <div className="analyst-top">
        <section className="card analyst-upload-card">
          <h1>Sales analyst dashboard</h1>
          <p>Upload a lead dump CSV. Data stays in this browser session.</p>
          <label className="field">
            <span>Lead dump CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void loadLeads(event.target.files?.[0])}
            />
          </label>
          {filename && (
            <p>
              {filename} — {leads.length.toLocaleString()} leads counted;{" "}
              {duplicates.toLocaleString()} duplicate phone rows removed.
              {missingDates > 0 &&
                ` ${missingDates.toLocaleString()} retained leads have no valid creation date; for equal or missing dates the first row is kept.`}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <details className="analyst-method">
            <summary>How these numbers are calculated</summary>
            <p className="form-help">
              One valid phone number counts as one lead; its most recently
              created lead supplies the BD and status. Rows without a valid
              phone remain separate. Shared phone numbers may represent
              different patients. Ideal L2O = currently OPD booked ÷ leads; real
              L2O = currently OPD visited ÷ leads. IPD done = CLOSED +
              SUCCESSFULLY_TREATED. Current statuses are separate snapshots:
              previous OPD visits cannot be recovered from them. CASE_COMPLETED
              is listed separately until its meaning is confirmed. Rates depend
              on the file's date range and are not cohort-adjusted.
            </p>
          </details>
        </section>
      </div>
      {filename && (
        <>
          <div className="sales-toolbar">
            <div className="sales-tabs" aria-label="Lead creation window">
              {([7, 14, 30] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  className={windowDays === days ? "active" : ""}
                  aria-pressed={windowDays === days}
                  onClick={() => setWindowDays(days)}
                >
                  T-{days}
                </button>
              ))}
            </div>
            <label>
              BD{" "}
              <select aria-label="Select BD" value={selectedBd} onChange={(e) => setSelectedBd(e.target.value)}>
                <option value="">Overall — all BDs</option>
                {bdNames.map((name) => <option value={name} key={name}>{name}</option>)}
              </select>
            </label>
            <label>
              Min leads{" "}
              <input
                type="number"
                min="0"
                value={minimum}
                onChange={(e) =>
                  setMinimum(Math.max(0, Number(e.target.value) || 0))
                }
              />
            </label>
          </div>
          <p className="sales-help">
            Summary and table: latest {windowDays} calendar days ending on the
            most recent lead creation date (UTC).{" "}
            {selectedBd ? `Showing ${selectedBd}.` : "Showing all BDs."} Missing
            creation dates are excluded.
          </p>
          <div className="sales-metrics">
            {[
              ["Leads", countButton("Leads", scopedLeads)],
              ["Interested", countButton("Interested", interestedRows)],
              ["Converted", countButton("Converted", convertedRows)],
              ["Good leads", countButton("Good leads", goodRows)],
              ["Good lead %", percent(goodRows.length, scopedLeads.length)],
              ["Ideal L2O", percent(bookedRows.length, scopedLeads.length)],
              ["Real L2O", percent(visitedRows.length, scopedLeads.length)],
              ["IPD done", countButton("IPD done", treatedRows)],
            ].map(([label, value]) => (
              <div className="sales-metric" key={String(label)}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <section className="sales-charts">
            <p className="sales-help">
              Charts: {selectedBd ? selectedBd : "all BDs"}. Each point uses the
              trailing window ending on that day. Good leads are currently
              Interested or Converted; past statuses cannot be recovered from
              the dump.
            </p>
            <LeadTrendCharts leads={chartLeads} />
          </section>
          <section className="sales-reference-table">
            <h2>BD performance</h2>
            <p className="sales-help">
              Select a BD above to filter this dashboard. Minimum leads filters this table.
            </p>
            {selectedBd && scopedLeads.length === 0 && <p className="sales-help">No leads for this BD in the selected time window.</p>}
            {selectedBd && scopedLeads.length > 0 && scopedLeads.length < minimum && <p className="sales-help">This BD is below the minimum leads filter.</p>}
            <div className="analyst-scroll">
              <table>
                <thead>
                  <tr>
                    <th>BD</th>
                    <th>Leads</th>
                    <th>Interested</th>
                    <th>Converted</th>
                    <th>Good</th>
                    <th>Good %</th>
                    <th>OPD booked</th>
                    <th>Ideal L2O</th>
                    <th>OPD visited</th>
                    <th>Real L2O</th>
                    <th>IPD done</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.groups]
                    .filter(
                      ([owner, rows]) => (!selectedBd || owner === selectedBd) && rows.length >= minimum,
                    )
                    .sort(
                      (a, b) =>
                        b[1].filter(good).length - a[1].filter(good).length ||
                        a[0].localeCompare(b[0]),
                    )
                    .map(([owner, rows]) => {
                      const b = rows.filter(booked),
                        v = rows.filter(visited),
                        i = rows.filter(treated),
                        interest = rows.filter(interested),
                        conv = rows.filter(converted),
                        g = rows.filter(good);
                      return (
                        <tr key={owner}>
                          <td>
                            <button
                              type="button"
                              className="analyst-count"
                              aria-pressed={selectedBd === owner}
                              onClick={() =>
                                setSelectedBd(selectedBd === owner ? "" : owner)
                              }
                            >
                              {owner}
                            </button>
                          </td>
                          <td>{countButton(`${owner} — leads`, rows)}</td>
                          <td>
                            {countButton(`${owner} — interested`, interest)}
                          </td>
                          <td>{countButton(`${owner} — converted`, conv)}</td>
                          <td>{countButton(`${owner} — good leads`, g)}</td>
                          <td>{percent(g.length, rows.length)}</td>
                          <td>{countButton(`${owner} — OPD booked`, b)}</td>
                          <td>{percent(b.length, rows.length)}</td>
                          <td>{countButton(`${owner} — OPD visited`, v)}</td>
                          <td>{percent(v.length, rows.length)}</td>
                          <td>{countButton(`${owner} — IPD done`, i)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card analyst-section">
            <h2>Status and sub-status</h2>
            <div className="analyst-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Sub-status</th>
                    <th>Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {[...report.statuses].map(([key, rows]): [string, Lead[]] => [key, selectedBd ? rows.filter((row) => (row.Owner?.trim() || "Unassigned") === selectedBd) : rows]).filter(([, rows]) => rows.length > 0)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([key, rows]) => {
                      const [status, sub] = key.split("|");
                      return (
                        <tr key={key}>
                          <td>{labels[status] || readable(status)}</td>
                          <td>{readable(sub)}</td>
                          <td>
                            {countButton(
                              `${readable(status)} — ${readable(sub)}`,
                              rows,
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {popup && (
        <div className="modal-backdrop" onMouseDown={() => setPopup(null)}>
          <section
            className="payee-modal analyst-patient-modal"
            role="dialog"
            aria-modal="true"
            aria-label={popup.title}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="section-title">
              <h1>{popup.title}</h1>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => setPopup(null)}
              >
                ×
              </button>
            </div>
            <div className="analyst-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Lead ID</th>
                    <th>Patient name</th>
                    <th>BD</th>
                    <th>Status</th>
                    <th>Sub-status</th>
                  </tr>
                </thead>
                <tbody>
                  {popup.leads.map((row, index) => (
                    <tr key={`${row["Lead ID"]}-${index}`}>
                      <td>{row["Lead ID"] || "—"}</td>
                      <td>{row["Patient Name"] || "—"}</td>
                      <td>{row.Owner || "—"}</td>
                      <td>{readable(row.Status)}</td>
                      <td>{readable(row["Sub-status"])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

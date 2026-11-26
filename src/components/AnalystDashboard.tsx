import { useState } from "react";
import { csvRows } from "../lib/excelImport";

export function AnalystDashboard() {
  const [filename, setFilename] = useState("");
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");

  const loadLeads = async (file?: File) => {
    if (!file) return;
    try {
      const rows = csvRows((await file.text()).replace(/^\uFEFF/, ""));
      const headers = rows.shift()?.map((value) => value.trim()) || [];
      if (!headers.includes("Lead ID")) throw new Error("This file must contain a Lead ID column.");
      setFilename(file.name);
      setCount(rows.length);
      setError("");
    } catch (e) {
      setFilename("");
      setCount(0);
      setError(e instanceof Error ? e.message : "Could not read this file.");
    }
  };

  return <main><section className="card">
    <h1>Sales analyst dashboard</h1>
    <p>Upload a lead dump CSV. The file stays in this browser session and is not saved or shared.</p>
    <label className="field"><span>Lead dump CSV</span><input type="file" accept=".csv,text/csv" onChange={(event) => void loadLeads(event.target.files?.[0])} /></label>
    {filename && <p>{filename} — {count.toLocaleString()} rows loaded.</p>}
    {error && <p role="alert">{error}</p>}
    <p className="form-help">Performance reports will be added after the lead-dump rules are defined.</p>
  </section></main>;
}

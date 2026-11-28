import { useMemo, useState } from "react";

type Lead = Record<string, string>;
type Metric = "good" | "visited";
type DayCounts = { total: number; good: number; visited: number };
type Point = { day: number; value: number | null; total: number };
const DAY = 86_400_000;
const windows = [
  { days: 7, color: "#199b78" },
  { days: 14, color: "#3886d9" },
  { days: 30, color: "#db5932" },
];
const upper = (value?: string) => (value || "").trim().toUpperCase();
const dateLabel = (day: number) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(day * DAY));

function TrendChart({ title, description, bins, days, metric }: { title: string; description: string; bins: Map<number, DayCounts>; days: number[]; metric: Metric }) {
  const [hidden, setHidden] = useState<number[]>([]);
  const series = windows.map(({ days: length, color }) => ({
    length,
    color,
    points: days.map((day): Point => {
      let total = 0;
      let count = 0;
      for (let offset = 0; offset < length; offset++) {
        const bin = bins.get(day - offset);
        if (bin) { total += bin.total; count += bin[metric]; }
      }
      return { day, total, value: total ? 100 * count / total : null };
    }),
  }));
  const values = series.filter((s) => !hidden.includes(s.length)).flatMap((s) => s.points.flatMap((p) => p.value === null ? [] : [p.value]));
  const max = Math.min(100, Math.max(10, Math.ceil(Math.max(0, ...values) / 10) * 10));
  const left = 48, right = 580, top = 18, bottom = 205;
  const x = (i: number) => days.length === 1 ? (left + right) / 2 : left + i * (right - left) / (days.length - 1);
  const y = (value: number) => bottom - value / max * (bottom - top);
  const path = (points: Point[]) => {
    let drawing = false;
    return points.map((point, i) => {
      if (point.value === null) { drawing = false; return ""; }
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${x(i).toFixed(2)},${y(point.value).toFixed(2)}`;
    }).join(" ");
  };
  const tickCount = Math.min(8, days.length);
  const ticks = [...new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (days.length - 1) / Math.max(1, tickCount - 1))))];
  return <section className="lead-trend-chart"><h3>{title}</h3><p>{description}</p>
    {days.length ? <><svg viewBox="0 0 600 260" role="img" aria-label={`${title}: trailing 7, 14 and 30 day percentages, based on lead creation dates and current statuses`}>
      {[0, 0.25, 0.5, 0.75, 1].map((fraction) => <g key={fraction}><line x1={left} x2={right} y1={y(max * fraction)} y2={y(max * fraction)} className="lead-trend-grid" /><text x={left - 7} y={y(max * fraction) + 4} textAnchor="end" className="lead-trend-label">{(max * fraction).toFixed(max % 4 === 0 ? 0 : 1)}%</text></g>)}
      {ticks.map((i) => <g key={i}><line x1={x(i)} x2={x(i)} y1={top} y2={bottom} className="lead-trend-grid" /><text x={x(i)} y={bottom + 20} textAnchor="middle" className="lead-trend-label">{dateLabel(days[i])}</text></g>)}
      {series.filter((s) => !hidden.includes(s.length)).map((s) => <path key={s.length} d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />)}
      <text x={(left + right) / 2} y={bottom + 43} textAnchor="middle" className="lead-trend-label">Day the window ends (UTC)</text>
    </svg><div className="lead-trend-legend">{series.map((s) => <button type="button" key={s.length} aria-pressed={!hidden.includes(s.length)} onClick={() => setHidden((current) => current.includes(s.length) ? current.filter((n) => n !== s.length) : [...current, s.length])} style={{ border: 0, padding: 0, background: "transparent", color: "inherit", font: "inherit", cursor: "pointer", opacity: hidden.includes(s.length) ? 0.5 : 1, textDecoration: hidden.includes(s.length) ? "line-through" : "none", display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ background: s.color }} />T-{s.length} ({s.length}-day window)</button>)}</div></> : <p className="form-help">No leads with a valid creation date are available for this chart.</p>}
  </section>;
}

export function LeadTrendCharts({ leads }: { leads: Lead[] }) {
  const { bins, days, missingDates } = useMemo(() => {
    const result = new Map<number, DayCounts>();
    let missing = 0;
    for (const lead of leads) {
      const time = Date.parse(lead["Created At"] || "");
      if (!Number.isFinite(time)) { missing++; continue; }
      const day = Math.floor(time / DAY);
      const item = result.get(day) || { total: 0, good: 0, visited: 0 };
      const status = upper(lead.Status), substatus = upper(lead["Sub-status"]);
      item.total++;
      if (status === "INTERESTED" || status === "CONVERTED") item.good++;
      if (status === "CONVERTED" && substatus === "OPD_VISITED") item.visited++;
      result.set(day, item);
    }
    const availableDays = [...result.keys()].sort((a, b) => a - b);
    const last = availableDays[availableDays.length - 1];
    const first = availableDays[0];
    const visible = availableDays.length ? Array.from({ length: Math.min(31, last - first + 1) }, (_, index) => last - Math.min(30, last - first) + index) : [];
    return { bins: result, days: visible, missingDates: missing };
  }, [leads]);
  return <div className="lead-trends"><p className="lead-trend-note">Each point groups leads by their creation date and shows their current status in trailing 7-, 14- and 30-day windows. This is not a historical status snapshot. Recent leads may not have had time to convert. Dates use UTC.{missingDates ? ` ${missingDates} lead(s) without a valid creation date are excluded from charts.` : ""}</p><div className="lead-trend-grid-layout"><TrendChart title="Good lead % trend" description="Currently Interested or Converted ÷ leads" bins={bins} days={days} metric="good" /><TrendChart title="Real L2O % trend" description="Currently OPD visited ÷ leads" bins={bins} days={days} metric="visited" /></div></div>;
}

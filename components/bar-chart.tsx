// Server-rendered stacked bar chart (one y-axis). Hover: native <title> per day; table view below.
// Colors: validated categorical slots 1-2 (dataviz palette: #2a78d6, #eb6834) on the light surface.
export type Series = { key: string; label: string; color: string };

const W = 720, H = 180, PAD = { l: 44, r: 8, t: 8, b: 22 };

/** Rect with only the top corners rounded (data end), flat on the baseline. */
const topRounded = (x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

export function BarChart({ title, rows, series, format }: {
  title: string; rows: Record<string, number | string>[]; series: Series[]; format: (n: number) => string;
}) {
  const totals = rows.map((r) => series.reduce((n, s) => n + Number(r[s.key] || 0), 0));
  const max = Math.max(...totals, 0) || 1;
  const ticks = [0, max / 2, max].filter((t, i, all) => all.findIndex((u) => format(u) === format(t)) === i); // no duplicate labels
  const empty = totals.every((t) => t === 0);
  const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const slot = plotW / Math.max(rows.length, 1), barW = Math.max(2, slot - 4);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  return (
    <figure className="card space-y-2">
      <figcaption className="flex flex-wrap items-center gap-4 text-sm">
        <span className="font-medium text-slate-900">{title}</span>
        {series.length > 1 && series.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-slate-600">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
          </span>
        ))}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}, last ${rows.length} days`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#e5e4df" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="#52514e">{format(t)}</text>
          </g>
        ))}
        {empty && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fill="#52514e">No data in this period yet</text>}
        {rows.map((r, i) => {
          const x = PAD.l + i * slot + (slot - barW) / 2;
          let base = 0;
          const segs = series.map((s) => {
            const v = Number(r[s.key] || 0);
            const seg = { s, v, y0: base, y1: base + v };
            base += v;
            return seg;
          }).filter((g) => g.v > 0);
          return (
            <g key={String(r.day)}>
              <title>{`${r.day}: ${series.map((s) => `${s.label} ${format(Number(r[s.key] || 0))}`).join(", ")}`}</title>
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={plotH} fill="transparent" />
              {segs.map((g, j) => {
                const top = y(g.y1), h = Math.max(0, y(g.y0) - top - (j > 0 ? 2 : 0)); // 2px surface gap between segments
                return j === segs.length - 1
                  ? <path key={g.s.key} d={topRounded(x, top, barW, h, 4)} fill={g.s.color} />
                  : <rect key={g.s.key} x={x} y={top + 2} width={barW} height={Math.max(0, h - 2)} fill={g.s.color} />;
              })}
              {i % 7 === 0 && <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#52514e">{String(r.day).slice(5)}</text>}
            </g>
          );
        })}
      </svg>
      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer">Table view</summary>
        <table className="mt-1 w-full"><thead><tr><th className="text-left">Day</th>{series.map((s) => <th key={s.key} className="text-right">{s.label}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={String(r.day)}><td>{r.day}</td>{series.map((s) => <td key={s.key} className="text-right">{format(Number(r[s.key] || 0))}</td>)}</tr>)}</tbody></table>
      </details>
    </figure>
  );
}

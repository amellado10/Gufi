// Ranked horizontal bars with the value at each bar's tip (single series, so no legend).
// Text stays in text colors; the pink bar carries the magnitude.
export type BarRow = { label: string; cents: number; note?: string };

const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export function BarList({ rows, label, total }: { rows: BarRow[]; label: string; total?: number }) {
  const max = Math.max(...rows.map((r) => r.cents), 1);
  return (
    <ul aria-label={label} className="space-y-2.5">
      {rows.map((r) => {
        const pct = (r.cents / max) * 100;
        const share = total ? Math.round((r.cents / total) * 100) : null;
        return (
          <li key={r.label} className="grid grid-cols-1 items-center gap-x-3 gap-y-0.5 text-[13px] sm:grid-cols-[minmax(0,12rem)_1fr]">
            <span className="truncate" title={r.label}>
              {r.label}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="h-2.5 shrink-0 rounded-r-[4px] bg-brand" style={{ width: `max(${pct * 0.7}%, 2px)` }} />
              <span className="tabular whitespace-nowrap font-semibold">
                {fmt(r.cents)}
                {share !== null && <span className="font-normal text-muted-foreground"> · {share}%</span>}
              </span>
            </span>
            {r.note && <span className="text-xs text-muted-foreground sm:col-start-2">{r.note}</span>}
          </li>
        );
      })}
    </ul>
  );
}

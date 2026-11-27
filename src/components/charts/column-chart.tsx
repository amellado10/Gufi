"use client";

// Single-series column chart (e.g. revenue by month). One color, so no legend: the card title
// names the series. Thin columns (≤24px) with 4px rounded tops on one baseline, hairline grid,
// labels only on the largest values, hover/focus tooltip on every column, partial periods
// hatched, and a table view for exact values.
import { useState } from "react";

export type Column = { key: string; label: string; longLabel: string; cents: number; partial?: boolean };

const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

function niceMax(maxCents: number) {
  const dollars = maxCents / 100;
  if (dollars <= 0) return { top: 10000, step: 10000 };
  const steps = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  const step = steps.find((s) => dollars / s <= 5) ?? 100000;
  return { top: Math.ceil(dollars / step) * step * 100, step: step * 100 };
}

export function ColumnChart({ data, label, labelTop = 2 }: { data: Column[]; label: string; labelTop?: number }) {
  const [active, setActive] = useState<string | null>(null);
  const { top, step } = niceMax(Math.max(...data.map((d) => d.cents), 0));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelled = new Set(
    [...data]
      .filter((d) => d.cents > 0)
      .sort((a, b) => b.cents - a.cents)
      .slice(0, labelTop)
      .map((d) => d.key),
  );
  const hasPartial = data.some((d) => d.partial);

  return (
    <figure className="m-0">
      <div className="relative flex gap-2" role="group" aria-label={label}>
        <div aria-hidden className="tabular relative h-48 w-12 shrink-0 text-right text-[11px] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(t / top) * 100}%` }}>
              {fmt(t)}
            </span>
          ))}
        </div>
        <div className="relative h-48 flex-1">
          {ticks.map((t) => (
            <div key={t} aria-hidden className={`absolute inset-x-0 h-px ${t === 0 ? "bg-border-strong" : "bg-border"}`} style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d) => {
              const pct = (d.cents / top) * 100;
              const isActive = active === d.key;
              return (
                <div
                  key={d.key}
                  tabIndex={0}
                  aria-label={`${d.longLabel}: ${fmt(d.cents)}${d.partial ? " (partial month)" : ""}`}
                  onMouseEnter={() => setActive(d.key)}
                  onMouseLeave={() => setActive((a) => (a === d.key ? null : a))}
                  onFocus={() => setActive(d.key)}
                  onBlur={() => setActive((a) => (a === d.key ? null : a))}
                  className="relative flex h-full flex-1 cursor-default items-end justify-center rounded-sm focus-visible:bg-pink-50"
                >
                  {isActive && <div aria-hidden className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-strong" />}
                  <div
                    className="relative w-[60%] max-w-6 rounded-t-[4px]"
                    style={{
                      height: d.cents > 0 ? `max(${pct}%, 2px)` : 0,
                      background: d.partial
                        ? "repeating-linear-gradient(135deg, var(--gufi-pink) 0 3px, var(--gufi-pink-200) 3px 6px)"
                        : "var(--gufi-pink)",
                    }}
                  >
                    {labelled.has(d.key) && !isActive && (
                      <span aria-hidden className="tabular absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold">
                        {fmt(d.cents)}
                      </span>
                    )}
                  </div>
                  {isActive && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-pop"
                      style={{ bottom: `calc(${Math.min(pct, 80)}% + 10px)` }}
                    >
                      <span className="block text-muted-foreground">{d.longLabel}</span>
                      <span className="tabular block font-semibold">
                        {fmt(d.cents)}
                        {d.partial ? " · partial" : ""}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div aria-hidden className="ml-14 flex text-[11px] text-muted-foreground">
        {data.map((d) => (
          <span key={d.key} className="flex-1 pt-1.5 text-center">
            {d.label}
            {d.partial ? "*" : ""}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
        {hasPartial ? <span>* Partial month (hatched)</span> : <span />}
        <details>
          <summary className="cursor-pointer font-medium text-link hover:underline">Show as table</summary>
          <table className="mt-2 w-full min-w-56 text-left text-xs text-foreground">
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-4 font-semibold">
                  Month
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-t border-border">
                  <td className="py-1 pr-4">
                    {d.longLabel}
                    {d.partial ? " (partial)" : ""}
                  </td>
                  <td className="tabular py-1 text-right">{fmt(d.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}

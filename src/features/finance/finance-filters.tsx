"use client";

// One row of filters above everything they scope. Changing a filter updates the URL (so the
// view can be bookmarked or shared); while the server re-renders, the content stays in place
// at reduced opacity instead of flashing.
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { PERIOD_PRESETS, STATUS_FILTERS, type FinanceFilters } from "./filters";

type Option = { value: string; label: string };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Option[] }) {
  return (
    <label className="flex min-w-36 flex-1 flex-col gap-1 sm:flex-none">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-36 rounded-md border border-input bg-card px-2.5 text-sm text-foreground focus-visible:border-brand"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FinanceFilterBar({
  filters,
  months,
  clients,
  partners,
  children,
}: {
  filters: FinanceFilters;
  months: string[];
  clients: Option[];
  partners: Option[] | null; // null = not allowed to filter by partner
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "" || v === "all" || (k === "period" && v === "ytd")) next.delete(k);
      else next.set(k, v);
    }
    if (next.get("period") !== "custom") {
      next.delete("from");
      next.delete("to");
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const active = filters.period !== "ytd" || filters.client || filters.status !== "all" || filters.partner;
  const monthOptions = months.map((m) => ({ value: m, label: monthLabel(m) }));

  return (
    <>
      <div role="search" aria-label="Filter finance" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 shadow-card">
        <Select label="Period" value={filters.period} onChange={(v) => update({ period: v })} options={[...PERIOD_PRESETS]} />
        {filters.period === "custom" && (
          <>
            <Select label="From" value={filters.from} onChange={(v) => update({ period: "custom", from: v, to: filters.to })} options={monthOptions} />
            <Select label="To" value={filters.to} onChange={(v) => update({ period: "custom", from: filters.from, to: v })} options={monthOptions} />
          </>
        )}
        <Select label="Client" value={filters.client ?? ""} onChange={(v) => update({ client: v })} options={[{ value: "", label: "All clients" }, ...clients]} />
        <Select label="Projects" value={filters.status} onChange={(v) => update({ status: v })} options={[...STATUS_FILTERS]} />
        {partners && (
          <Select label="Partner" value={filters.partner ?? ""} onChange={(v) => update({ partner: v })} options={[{ value: "", label: "All partners" }, ...partners]} />
        )}
        {active && (
          <button
            type="button"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
            className="inline-flex h-9 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-link hover:bg-accent"
          >
            <X aria-hidden className="size-4" /> Clear filters
          </button>
        )}
        <span role="status" aria-live="polite" className="sr-only">
          {pending ? "Updating…" : ""}
        </span>
      </div>
      <div aria-busy={pending} className={`transition-opacity duration-200 ${pending ? "opacity-50" : ""}`}>
        {children}
      </div>
    </>
  );
}

// Finance page filters, read from the URL (?period=q3&client=…&status=balance&partner=…), so a
// filtered view can be bookmarked or shared. Pure functions: tested in tests/unit/finance-filters.test.ts.
import { z } from "zod";

export const PERIOD_PRESETS = [
  { value: "ytd", label: "Year to date" },
  { value: "q1", label: "Q1 (Jan–Mar)" },
  { value: "q2", label: "Q2 (Apr–Jun)" },
  { value: "q3", label: "Q3 (Jul–Sep)" },
  { value: "q4", label: "Q4 (Oct–Dec)" },
  { value: "last3", label: "Last 3 months" },
  { value: "custom", label: "Custom range" },
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["value"];

export const STATUS_FILTERS = [
  { value: "all", label: "All projects" },
  { value: "balance", label: "With a balance to collect" },
  { value: "active", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

export type FinanceFilters = {
  period: PeriodPreset;
  from: string; // "YYYY-MM", inclusive
  to: string; // "YYYY-MM", inclusive
  client: string | null;
  status: StatusFilter;
  partner: string | null;
};

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const uuid = z.uuid();
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// `months` are the months the data covers, in order ("2026-01" … "2026-11").
export function parseFinanceFilters(params: Record<string, string | string[] | undefined>, months: string[]): FinanceFilters {
  const first = months[0] ?? "2026-01";
  const last = months[months.length - 1] ?? first;
  const year = last.slice(0, 4);
  const period = (PERIOD_PRESETS.some((p) => p.value === one(params.period)) ? one(params.period) : "ytd") as PeriodPreset;

  let from = first;
  let to = last;
  const quarter = (q: number) => [`${year}-${String(q * 3 - 2).padStart(2, "0")}`, `${year}-${String(q * 3).padStart(2, "0")}`];
  if (period === "q1" || period === "q2" || period === "q3" || period === "q4") [from, to] = quarter(Number(period[1]));
  if (period === "last3") from = months[Math.max(0, months.length - 3)] ?? first;
  if (period === "custom") {
    const f = month.safeParse(one(params.from));
    const t = month.safeParse(one(params.to));
    if (f.success) from = f.data;
    if (t.success) to = t.data;
    if (from > to) [from, to] = [to, from];
  }
  const client = uuid.safeParse(one(params.client));
  const partner = uuid.safeParse(one(params.partner));
  const status = (STATUS_FILTERS.some((s) => s.value === one(params.status)) ? one(params.status) : "all") as StatusFilter;
  return { period, from, to, client: client.success ? client.data : null, status, partner: partner.success ? partner.data : null };
}

export function inPeriod(m: string, f: Pick<FinanceFilters, "from" | "to">) {
  return m >= f.from && m <= f.to;
}

export function isFullPeriod(f: Pick<FinanceFilters, "from" | "to">, months: string[]) {
  return f.from <= months[0] && f.to >= months[months.length - 1];
}

export function hasProjectFilters(f: FinanceFilters) {
  return Boolean(f.client || f.partner || f.status !== "all");
}

export function matchesProject(
  p: { clientId: string | null; status: string; outstandingCents: number; partnerIds: string[] },
  f: FinanceFilters,
): boolean {
  if (f.client && p.clientId !== f.client) return false;
  if (f.partner && !p.partnerIds.includes(f.partner)) return false;
  if (f.status === "balance") return p.outstandingCents > 0;
  if (f.status !== "all" && p.status !== f.status) return false;
  return true;
}

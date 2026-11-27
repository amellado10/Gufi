// Consistency checks for an import file, run before anything is written.
// "error" blocks the import; "note" is shown but allowed (e.g. rounding in the source).
import { partnerAmounts, splitProblems } from "./split";
import type { CompanySnapshotData, ImportFile } from "./snapshot";

export type Check = { level: "ok" | "note" | "error"; message: string };

const usd = (c: number | bigint) => {
  const n = Number(c);
  return `${n < 0 ? "−" : ""}$${(Math.abs(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function checkImport(file: ImportFile): Check[] {
  const checks: Check[] = [];
  const eq = (label: string, a: number, b: number, tolerance = 0) => {
    const diff = Math.abs(a - b);
    checks.push({
      level: diff === 0 ? "ok" : diff <= tolerance ? "note" : "error",
      message: `${label}: ${usd(a)} vs ${usd(b)}${diff ? ` (off by ${usd(diff)})` : ""}`,
    });
  };

  const clientNames = new Set(file.clients.map((c) => c.name));
  const partnerNames = new Set(file.partners.map((p) => p.name));
  for (const p of file.projects) {
    if (!clientNames.has(p.client)) checks.push({ level: "error", message: `Project "${p.name}" refers to unknown client "${p.client}"` });
    for (const s of p.splits) if (!partnerNames.has(s.partner)) checks.push({ level: "error", message: `Project "${p.name}" refers to unknown partner "${s.partner}"` });
    for (const problem of splitProblems(p.splits.map((s) => ({ partnerId: s.partner, role: s.role, percentBps: s.percent_bps })))) {
      checks.push({ level: "error", message: `Project "${p.name}": ${problem}` });
    }
    const f = p.finance;
    if (f.tax_rate_bps !== null && f.collected_cents !== null) {
      const tax = Math.floor((f.contract_cents * f.tax_rate_bps + 5000) / 10000);
      eq(`${p.name}: contract + tax − collected = outstanding`, f.contract_cents + tax - f.collected_cents, f.outstanding_cents);
    }
  }
  for (const x of file.payouts) if (!partnerNames.has(x.partner)) checks.push({ level: "error", message: `Payout "${x.key}" refers to unknown partner "${x.partner}"` });

  const company = file.snapshots.find((s) => s.audience === "finance")?.data as CompanySnapshotData | undefined;
  if (company) {
    const h = company.headline;
    eq("Revenue = projects + other", h.project_revenue_cents + sum(h.other_revenue.map((o) => o.cents)), h.revenue_cents);
    eq("Monthly revenue adds up to the year", sum(company.monthly_revenue.map((m) => m.cents)), h.revenue_cents);
    eq("Revenue by client adds up to the year", sum(company.revenue_by_client.map((c) => c.cents)), h.revenue_cents);
    eq("Project balances add up to receivables", sum(file.projects.map((p) => p.finance.outstanding_cents)), h.receivables_cents);
    const open = file.projects.filter((p) => p.finance.outstanding_cents > 0).length;
    checks.push({ level: open === h.receivables_projects ? "ok" : "error", message: `Projects with a balance: ${open} vs ${h.receivables_projects}` });
    const c = company.costs;
    eq("Cost-of-sales categories", sum(c.categories.filter((x) => x.group === "cost_of_sales").map((x) => x.cents)), c.cost_of_sales_cents);
    eq("Expense categories", sum(c.categories.filter((x) => x.group === "expense").map((x) => x.cents)), c.expenses_cents);
    eq("Cost of sales + expenses = total costs", c.cost_of_sales_cents + c.expenses_cents, c.total_cents, 100);
    eq("Gross margin = project revenue − cost of sales", h.project_revenue_cents - c.cost_of_sales_cents, c.gross_margin_cents);
    eq("Net result = revenue − total costs", h.revenue_cents - c.total_cents, h.net_result_cents);
  }
  return checks;
}

// What each partner is owed on full contracts, what they've been paid, and the balance.
export function partnerBalances(file: Pick<ImportFile, "projects" | "payouts" | "partners">) {
  const rows = new Map(file.partners.map((p) => [p.name, { origination: BigInt(0), delivery: BigInt(0), paid: BigInt(0) }]));
  for (const p of file.projects) {
    const amounts = partnerAmounts(
      p.finance.contract_cents,
      p.splits.map((s) => ({ partnerId: s.partner, role: s.role, percentBps: s.percent_bps })),
    );
    for (const a of amounts) rows.get(a.partnerId)![a.role] += a.cents;
  }
  for (const x of file.payouts) rows.get(x.partner)!.paid += BigInt(x.amount_cents);
  return [...rows.entries()].map(([name, r]) => ({ name, ...r, owed: r.origination + r.delivery, balance: r.origination + r.delivery - r.paid }));
}

export { usd as formatUsd };

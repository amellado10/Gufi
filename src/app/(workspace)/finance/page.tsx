import type { Metadata } from "next";
import Link from "next/link";
import { CircleExclamationPoint, Database, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { formatDay } from "@/lib/format";
import { formatMoney, formatMoneyWhole } from "@/lib/money";
import { getCompanySnapshot, getPartnerBalances, getPartnerSnapshot, listProjectFinances } from "@/features/finance/queries";
import { PROJECT_STATUS, type ProjectStatus } from "@/features/projects/status";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Finance" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "critical" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
      <p className={`display tabular mt-2 text-[30px] font-bold leading-none ${tone === "critical" ? "text-status-critical" : ""}`}>{value}</p>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function FinancePage() {
  const ws = await requirePermission("finance:read");
  const isAdmin = can(ws.role, "partners:read");
  const [snapshot, finances, partnerSnap, balances] = await Promise.all([
    getCompanySnapshot(ws.organization.id),
    listProjectFinances(ws.organization.id),
    isAdmin ? getPartnerSnapshot(ws.organization.id) : Promise.resolve(null),
    isAdmin ? getPartnerBalances(ws.organization.id) : Promise.resolve(null),
  ]);
  const cur = ws.organization.default_currency;
  const money = (cents: number | bigint) => formatMoney({ cents, currency: cur });
  const whole = (cents: number | bigint) => formatMoneyWhole({ cents, currency: cur });

  if (!snapshot && finances.length === 0) {
    return (
      <>
        <PageHeader title="Finance" />
        <Card>
          <EmptyState icon={Wallet} title="No financial data yet">
            Company figures appear here once a report from the accounting system is imported. Nothing is estimated in the meantime.
          </EmptyState>
        </Card>
      </>
    );
  }

  const receivables = finances.filter((f) => f.outstanding_cents > 0);
  const receivablesTotal = receivables.reduce((a, f) => a + f.outstanding_cents, 0);
  const h = snapshot?.data.headline;

  return (
    <>
      <PageHeader
        title="Finance"
        description={snapshot ? `${snapshot.title}. ${formatDay(snapshot.period_start)} – ${formatDay(snapshot.period_end)}.` : undefined}
      />

      {snapshot && (
        <p className="mb-6 flex items-start gap-2 rounded-lg border border-border-strong bg-pink-50 px-4 py-3 text-[13px]">
          <Database aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>
            <strong className="font-semibold">Imported snapshot, not live.</strong> {snapshot.source}. {snapshot.basis === "accrual" ? "Accrual basis" : "Cash basis"}
            {snapshot.reconciled_through ? `, bank reconciled through ${formatDay(snapshot.reconciled_through)}` : ""}. QuickBooks remains the system of record;
            re-import to update.
          </span>
        </p>
      )}

      {h && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Tile
            label="Revenue, year to date"
            value={whole(h.revenue_cents)}
            sub={`${whole(h.project_revenue_cents)} projects${h.other_revenue.map((o) => ` + ${whole(o.cents)} ${o.label}`).join("")}`}
          />
          <Tile label={h.net_result_cents < 0 ? "Net result (loss)" : "Net result"} value={whole(h.net_result_cents)} sub={h.net_result_note} tone={h.net_result_cents < 0 ? "critical" : undefined} />
          <Tile label="To collect" value={money(receivablesTotal)} sub={`${receivables.length} project${receivables.length === 1 ? "" : "s"}, incl. ITBMS`} />
          <Tile
            label="In the bank"
            value={whole(h.bank_balance_cents)}
            sub={`Reconciled ${formatDay(h.bank_reconciled_on)}. ${whole(h.bank_owed_to_partners_cents)} is owed to partners and about ${whole(h.bank_tax_approx_cents)} is ITBMS.`}
          />
        </div>
      )}

      {snapshot && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Revenue by month" description="Accrual basis, from QuickBooks." className="lg:col-span-2">
            <ColumnChart
              label="Revenue by month"
              data={snapshot.data.monthly_revenue.map((m) => {
                const i = Number(m.month.slice(5, 7)) - 1;
                return { key: m.month, label: MONTHS[i], longLabel: `${MONTHS_LONG[i]} ${m.month.slice(0, 4)}`, cents: m.cents, partial: m.partial };
              })}
            />
          </Card>

          <Card title="Revenue by client" description="Before ITBMS.">
            <BarList label="Revenue by client" rows={snapshot.data.revenue_by_client.map((c) => ({ label: c.label, cents: c.cents, note: c.note }))} total={snapshot.data.headline.revenue_cents} />
          </Card>

          <Card title="Where the money went" description={`Total costs ${whole(snapshot.data.costs.total_cents)}: cost of sales ${whole(snapshot.data.costs.cost_of_sales_cents)} + expenses ${whole(snapshot.data.costs.expenses_cents)}. Gross margin ${whole(snapshot.data.costs.gross_margin_cents)}.`}>
            <BarList
              label="Costs by category"
              rows={[...snapshot.data.costs.categories].sort((a, b) => b.cents - a.cents).map((c) => ({ label: c.label, cents: c.cents, note: c.note }))}
              total={snapshot.data.costs.total_cents}
            />
          </Card>
        </div>
      )}

      <Card title="To collect" description="Open balances by project, including ITBMS." padded={false} className="mt-6">
        {receivables.length === 0 ? (
          <EmptyState icon={Wallet} title="Nothing to collect" />
        ) : (
          <Table label="Open balances by project">
            <thead>
              <tr>
                <Th>Project</Th>
                <Th className="text-right">Contract</Th>
                <Th className="text-right">ITBMS</Th>
                <Th className="text-right">Collected</Th>
                <Th className="text-right">To collect</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {receivables.map((f) => {
                const s = f.project ? PROJECT_STATUS[f.project.status as ProjectStatus] : null;
                return (
                  <tr key={f.project_id} className="hover:bg-muted/60">
                    <Td>
                      {f.project ? (
                        <Link href={`/projects/${f.project.id}`} className="font-semibold hover:text-link hover:underline">
                          {f.project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {f.invoice_ref && <span className="block text-xs text-muted-foreground">{f.invoice_ref}</span>}
                    </Td>
                    <Td className="tabular text-right">{money(f.contract_cents)}</Td>
                    <Td className="tabular text-right text-muted-foreground">{f.tax_cents !== null ? money(f.tax_cents) : "—"}</Td>
                    <Td className="tabular text-right text-muted-foreground">{f.collected_cents !== null ? money(f.collected_cents) : "—"}</Td>
                    <Td className="tabular text-right font-semibold">{money(f.outstanding_cents)}</Td>
                    <Td>
                      <span className="flex flex-wrap items-center gap-2">
                        {s && (
                          <Badge tone={s.tone} icon={s.icon}>
                            {s.label}
                          </Badge>
                        )}
                        {f.payment_due_date && <span className="text-xs text-muted-foreground">Due {formatDay(f.payment_due_date)}</span>}
                      </span>
                    </Td>
                  </tr>
                );
              })}
              <tr className="bg-muted">
                <Td className="font-semibold">Total</Td>
                <Td className="tabular text-right font-semibold">{money(receivables.reduce((a, f) => a + f.contract_cents, 0))}</Td>
                <Td className="tabular text-right font-semibold">{money(receivables.reduce((a, f) => a + (f.tax_cents ?? 0), 0))}</Td>
                <Td className="tabular text-right font-semibold">{money(receivables.reduce((a, f) => a + (f.collected_cents ?? 0), 0))}</Td>
                <Td className="tabular text-right font-semibold">{money(receivablesTotal)}</Td>
                <Td />
              </tr>
            </tbody>
          </Table>
        )}
      </Card>

      {isAdmin && balances && balances.partners.length > 0 && (
        <Card
          title="Partner split · 15 / 60 / 25"
          description="15% to whoever brought the client, 60% to whoever did the work, 25% stays with Güfi. Calculated on full contracts before ITBMS, payable as each project is collected. Visible to admins only."
          padded={false}
          className="mt-6"
        >
          <Table label="Partner split">
            <thead>
              <tr>
                <Th>Partner</Th>
                <Th className="text-right">15% brought in</Th>
                <Th className="text-right">60% did the work</Th>
                <Th className="text-right">Earned</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {balances.partners.map((p) => (
                <tr key={p.id}>
                  <Td className="font-semibold">
                    {p.name}
                    {!p.hasAccount && <span className="block text-xs font-normal text-muted-foreground">No Güfi OS account yet</span>}
                  </Td>
                  <Td className="tabular text-right">{money(p.origination)}</Td>
                  <Td className="tabular text-right">{money(p.delivery)}</Td>
                  <Td className="tabular text-right">{money(p.owed)}</Td>
                  <Td className="tabular text-right text-muted-foreground">{money(p.paid)}</Td>
                  <Td className="tabular text-right font-semibold">{money(p.balance)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="space-y-3 border-t border-border p-5 text-[13px]">
            {partnerSnap && (
              <p>
                <strong className="font-semibold">Owed now, from money already collected:</strong>{" "}
                {partnerSnap.data.due_from_collected.map((d) => `${d.partner} ${whole(d.cents)}`).join(" · ")}.{" "}
                <span className="text-muted-foreground">{partnerSnap.data.note}</span>
              </p>
            )}
            {balances.payouts.length > 0 && (
              <div>
                <p className="mb-1 font-semibold">Payments recorded</p>
                <ul className="space-y-1 text-muted-foreground">
                  {balances.payouts.map((p) => (
                    <li key={p.id} className="tabular">
                      {p.partner}: {money(p.amount_cents)} · {p.description}
                      {p.paid_month ? ` · ${MONTHS_LONG[Number(p.paid_month.slice(5, 7)) - 1]} ${p.paid_month.slice(0, 4)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {snapshot && snapshot.data.open_items.length > 0 && (
        <Card title="Open items" description="From the partners' summary." className="mt-6">
          <ul className="grid gap-4 sm:grid-cols-2">
            {snapshot.data.open_items.map((o) => (
              <li key={o.title} className="flex gap-2.5 text-sm">
                <CircleExclamationPoint aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>
                  <span className="block font-semibold">{o.title}</span>
                  <span className="text-muted-foreground">{o.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {snapshot && <p className="mt-4 text-xs text-muted-foreground">{snapshot.data.rounding_note}</p>}
    </>
  );
}

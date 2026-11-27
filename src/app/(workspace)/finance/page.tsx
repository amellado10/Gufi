import type { Metadata } from "next";
import Link from "next/link";
import { CircleExclamationPoint, Database, FolderKanban, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { formatDay } from "@/lib/format";
import { formatMoney, formatMoneyWhole } from "@/lib/money";
import { hasProjectFilters, inPeriod, isFullPeriod, matchesProject, parseFinanceFilters } from "@/features/finance/filters";
import { FinanceFilterBar } from "@/features/finance/finance-filters";
import { getCompanySnapshot, getPartnerBalances, getPartnerSnapshot, listProjectFinances, listProjectSplits } from "@/features/finance/queries";
import { partnerAmounts } from "@/features/finance/split";
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
const monthName = (m: string, long = false) => `${(long ? MONTHS_LONG : MONTHS)[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "critical" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
      <p className={`display tabular mt-2 text-[30px] font-bold leading-none ${tone === "critical" ? "text-status-critical" : ""}`}>{value}</p>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const ws = await requirePermission("finance:read");
  const isAdmin = can(ws.role, "partners:read");
  const [snapshot, finances, partnerSnap, balances, splits] = await Promise.all([
    getCompanySnapshot(ws.organization.id),
    listProjectFinances(ws.organization.id),
    isAdmin ? getPartnerSnapshot(ws.organization.id) : Promise.resolve(null),
    isAdmin ? getPartnerBalances(ws.organization.id) : Promise.resolve(null),
    isAdmin ? listProjectSplits(ws.organization.id) : Promise.resolve(new Map() as Awaited<ReturnType<typeof listProjectSplits>>),
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

  // ── Filters ────────────────────────────────────────────────────────────────
  const months = snapshot?.data.monthly_revenue.map((m) => m.month) ?? [];
  const filters = parseFinanceFilters(await searchParams, months);
  const fullPeriod = months.length === 0 || isFullPeriod(filters, months);
  const projectFiltered = hasProjectFilters(filters);

  const projects = finances.map((f) => {
    const lines = splits.get(f.project_id) ?? [];
    const amounts = partnerAmounts(
      f.contract_cents,
      lines.map((l) => ({ partnerId: l.partnerId, role: l.role, shareBps: l.shareBps })),
      { originationBps: f.origination_bps, deliveryBps: f.delivery_bps },
    );
    return {
      ...f,
      clientId: f.project?.client?.id ?? null,
      clientName: f.project?.client?.name ?? "—",
      status: f.project?.status ?? "",
      lines: lines.map((l, i) => ({ ...l, cents: amounts[i].cents })),
    };
  });
  const shown = projects.filter((p) =>
    matchesProject({ clientId: p.clientId, status: p.status, outstandingCents: p.outstanding_cents, partnerIds: p.lines.map((l) => l.partnerId) }, filters),
  );
  const sum = (rows: typeof shown, pick: (r: (typeof shown)[number]) => number | null) => rows.reduce((a, r) => a + (pick(r) ?? 0), 0);

  const clientOptions = [...new Map(projects.filter((p) => p.clientId).map((p) => [p.clientId!, p.clientName])).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const partnerOptions = balances ? balances.partners.map((p) => ({ value: p.id, label: p.name })) : null;
  const selectedClient = clientOptions.find((c) => c.value === filters.client)?.label ?? null;
  const selectedPartner = partnerOptions?.find((p) => p.value === filters.partner)?.label ?? null;

  const h = snapshot?.data.headline;
  const periodMonths = snapshot?.data.monthly_revenue.filter((m) => inPeriod(m.month, filters)) ?? [];
  const periodRevenue = periodMonths.reduce((a, m) => a + m.cents, 0);
  const periodLabel = fullPeriod ? "year to date" : filters.from === filters.to ? monthName(filters.from) : `${monthName(filters.from)} – ${monthName(filters.to)}`;
  const ytdNote = "Year to date in the source, so the period filter doesn't change it.";

  // Partner earnings on the filtered projects (payments aren't tied to projects).
  const earnedOnShown = balances
    ? balances.partners
        .map((p) => {
          const own = shown.flatMap((r) => r.lines.filter((l) => l.partnerId === p.id));
          const o = own.filter((l) => l.role === "origination").reduce((a, l) => a + l.cents, BigInt(0));
          const d = own.filter((l) => l.role === "delivery").reduce((a, l) => a + l.cents, BigInt(0));
          return { id: p.id, name: p.name, origination: o, delivery: d, total: o + d };
        })
        .filter((p) => p.total > BigInt(0))
    : [];

  return (
    <>
      <PageHeader title="Finance" description={snapshot ? `${snapshot.title}. ${formatDay(snapshot.period_start)} – ${formatDay(snapshot.period_end)}.` : undefined} />

      {snapshot && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-border-strong bg-pink-50 px-4 py-3 text-[13px]">
          <Database aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>
            <strong className="font-semibold">Imported snapshot, not live.</strong> {snapshot.source}. {snapshot.basis === "accrual" ? "Accrual basis" : "Cash basis"}
            {snapshot.reconciled_through ? `, bank reconciled through ${formatDay(snapshot.reconciled_through)}` : ""}. QuickBooks remains the system of record;
            re-import to update.
          </span>
        </p>
      )}

      <FinanceFilterBar filters={filters} months={months} clients={clientOptions} partners={partnerOptions}>
        {h && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Tile
              label={fullPeriod ? "Revenue, year to date" : `Revenue, ${periodLabel}`}
              value={whole(fullPeriod ? h.revenue_cents : periodRevenue)}
              sub={
                fullPeriod
                  ? `${whole(h.project_revenue_cents)} projects${h.other_revenue.map((o) => ` + ${whole(o.cents)} ${o.label}`).join("")}`
                  : `Of ${whole(h.revenue_cents)} year to date`
              }
            />
            <Tile
              label={h.net_result_cents < 0 ? "Net result (loss), YTD" : "Net result, YTD"}
              value={whole(h.net_result_cents)}
              sub={fullPeriod ? h.net_result_note : ytdNote}
              tone={h.net_result_cents < 0 ? "critical" : undefined}
            />
            <Tile
              label={projectFiltered ? "To collect, filtered" : "To collect"}
              value={money(sum(shown, (r) => r.outstanding_cents))}
              sub={`${shown.filter((r) => r.outstanding_cents > 0).length} project${shown.filter((r) => r.outstanding_cents > 0).length === 1 ? "" : "s"} with a balance, incl. ITBMS`}
            />
            <Tile
              label="In the bank"
              value={whole(h.bank_balance_cents)}
              sub={`Reconciled ${formatDay(h.bank_reconciled_on)}. ${whole(h.bank_owed_to_partners_cents)} is owed to partners and about ${whole(h.bank_tax_approx_cents)} is ITBMS.`}
            />
          </div>
        )}

        {snapshot && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card title="Revenue by month" description={`Accrual basis, ${periodLabel}. ${whole(periodRevenue)} in total.`} className="lg:col-span-2">
              {periodMonths.length === 0 ? (
                <EmptyState icon={Wallet} title="No months in this period">
                  The imported data covers {monthName(months[0])} – {monthName(months[months.length - 1])}.
                </EmptyState>
              ) : (
                <ColumnChart
                  label={`Revenue by month, ${periodLabel}`}
                  data={periodMonths.map((m) => ({ key: m.month, label: MONTHS[Number(m.month.slice(5, 7)) - 1], longLabel: monthName(m.month, true), cents: m.cents, partial: m.partial }))}
                />
              )}
            </Card>

            <Card title="Revenue by client" description={`Before ITBMS. ${fullPeriod ? "Year to date." : ytdNote}`}>
              <BarList
                label="Revenue by client"
                rows={snapshot.data.revenue_by_client.map((c) => ({ label: c.label, cents: c.cents, note: c.note }))}
                total={snapshot.data.headline.revenue_cents}
                highlight={selectedClient}
              />
            </Card>

            <Card
              title="Where the money went"
              description={`Total costs ${whole(snapshot.data.costs.total_cents)}: cost of sales ${whole(snapshot.data.costs.cost_of_sales_cents)} + expenses ${whole(snapshot.data.costs.expenses_cents)}. Gross margin ${whole(snapshot.data.costs.gross_margin_cents)}.${fullPeriod ? "" : ` ${ytdNote}`}`}
            >
              <BarList
                label="Costs by category"
                rows={[...snapshot.data.costs.categories].sort((a, b) => b.cents - a.cents).map((c) => ({ label: c.label, cents: c.cents, note: c.note }))}
                total={snapshot.data.costs.total_cents}
              />
            </Card>
          </div>
        )}

        <Card
          title="Projects"
          description={`${shown.length} of ${projects.length} projects${selectedClient ? ` · ${selectedClient}` : ""}${selectedPartner ? ` · ${selectedPartner}` : ""}. Contracts before ITBMS; balances include it.`}
          padded={false}
          className="mt-6"
        >
          {shown.length === 0 ? (
            <EmptyState icon={FolderKanban} title="No projects match these filters" />
          ) : (
            <Table label="Projects with finances">
              <thead>
                <tr>
                  <Th>Project</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Contract</Th>
                  <Th className="text-right">Collected</Th>
                  <Th className="text-right">To collect</Th>
                  {isAdmin && <Th>Brought in · did the work</Th>}
                  {isAdmin && selectedPartner && <Th className="text-right">{selectedPartner} earns</Th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const s = PROJECT_STATUS[r.status as ProjectStatus];
                  const people = (role: "origination" | "delivery") =>
                    r.lines.filter((l) => l.role === role).map((l) => l.partnerName).join(" & ") || "—";
                  const partnerEarns = r.lines.filter((l) => l.partnerId === filters.partner).reduce((a, l) => a + l.cents, BigInt(0));
                  return (
                    <tr key={r.project_id} className="hover:bg-muted/60">
                      <Td>
                        {r.project ? (
                          <Link href={`/projects/${r.project.id}`} className="font-semibold hover:text-link hover:underline">
                            {r.project.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {[r.clientName !== r.project?.name ? r.clientName : null, r.invoice_ref, r.payment_due_date ? `due ${formatDay(r.payment_due_date)}` : null]
                            .filter(Boolean)
                            .join(" · ") || " "}
                        </span>
                      </Td>
                      <Td>
                        {s && (
                          <Badge tone={s.tone} icon={s.icon}>
                            {s.label}
                          </Badge>
                        )}
                      </Td>
                      <Td className="tabular text-right">{money(r.contract_cents)}</Td>
                      <Td className="tabular text-right text-muted-foreground">{r.collected_cents !== null ? money(r.collected_cents) : "—"}</Td>
                      <Td className={`tabular text-right ${r.outstanding_cents > 0 ? "font-semibold" : "text-muted-foreground"}`}>{money(r.outstanding_cents)}</Td>
                      {isAdmin && (
                        <Td className="text-[13px]">
                          {people("origination")} · {people("delivery")}
                        </Td>
                      )}
                      {isAdmin && selectedPartner && <Td className="tabular text-right font-semibold">{money(partnerEarns)}</Td>}
                    </tr>
                  );
                })}
                <tr className="bg-muted">
                  <Td className="font-semibold">Total</Td>
                  <Td />
                  <Td className="tabular text-right font-semibold">{money(sum(shown, (r) => r.contract_cents))}</Td>
                  <Td className="tabular text-right font-semibold">{money(sum(shown, (r) => r.collected_cents))}</Td>
                  <Td className="tabular text-right font-semibold">{money(sum(shown, (r) => r.outstanding_cents))}</Td>
                  {isAdmin && <Td />}
                  {isAdmin && selectedPartner && (
                    <Td className="tabular text-right font-semibold">
                      {money(shown.flatMap((r) => r.lines.filter((l) => l.partnerId === filters.partner)).reduce((a, l) => a + l.cents, BigInt(0)))}
                    </Td>
                  )}
                </tr>
              </tbody>
            </Table>
          )}
          {shown.some((r) => r.collected_cents === null) && (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
              &quot;—&quot; under Collected: the source only says these projects have nothing left to collect, not the exact amount received.
            </p>
          )}
        </Card>

        {isAdmin && balances && balances.partners.length > 0 && (
          <Card
            title="Partner split · 15 / 60 / 25"
            description={
              projectFiltered
                ? "Earned on the filtered projects. Payments aren't tied to projects, so paid and balance appear only without project filters. Admins only."
                : "15% to whoever brought the client, 60% to whoever did the work, 25% stays with Güfi. On full contracts before ITBMS, payable as each project is collected. Admins only."
            }
            padded={false}
            className="mt-6"
          >
            {projectFiltered ? (
              earnedOnShown.length === 0 ? (
                <EmptyState icon={Wallet} title="No split on these projects" />
              ) : (
                <Table label="Partner earnings on filtered projects">
                  <thead>
                    <tr>
                      <Th>Partner</Th>
                      <Th className="text-right">15% brought in</Th>
                      <Th className="text-right">60% did the work</Th>
                      <Th className="text-right">Earned</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnedOnShown.map((p) => (
                      <tr key={p.id}>
                        <Td className="font-semibold">{p.name}</Td>
                        <Td className="tabular text-right">{money(p.origination)}</Td>
                        <Td className="tabular text-right">{money(p.delivery)}</Td>
                        <Td className="tabular text-right font-semibold">{money(p.total)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )
            ) : (
              <>
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
                            {p.paid_month ? ` · ${monthName(p.paid_month.slice(0, 7), true)}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            )}
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
      </FinanceFilterBar>
    </>
  );
}

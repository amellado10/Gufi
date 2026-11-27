import type { Metadata } from "next";
import Link from "next/link";
import { Building, CalendarClock, FolderKanban, Plus, Sparkles, TriangleExclamationPoint, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { can } from "@/lib/roles";
import { daysBetween, formatDay, longDay, todayIn } from "@/lib/format";
import { getOverview } from "@/features/overview/queries";
import { getCompanySnapshot } from "@/features/finance/queries";
import { formatMoneyWhole } from "@/lib/money";
import { PROJECT_STATUS } from "@/features/projects/status";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Overview" };

function Stat({ label, value, hint, href, tone }: { label: string; value: number; hint: string; href: string; tone?: "critical" }) {
  return (
    <Link href={href} className="group rounded-lg border border-border bg-card p-5 shadow-card transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-pop">
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
      <p className={`tabular display mt-2 text-[32px] font-bold leading-none ${tone === "critical" && value > 0 ? "text-status-critical" : ""}`}>
        {value.toLocaleString("en-US")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground group-hover:text-link">{hint}</p>
    </Link>
  );
}

export default async function OverviewPage() {
  const ws = await requireWorkspace();
  const today = todayIn(ws.organization.timezone);
  const [o, money] = await Promise.all([
    getOverview(ws.organization.id, today),
    can(ws.role, "finance:read") ? getCompanySnapshot(ws.organization.id) : Promise.resolve(null),
  ]);
  const whole = (cents: number) => formatMoneyWhole({ cents, currency: ws.organization.default_currency });
  const firstName = (ws.profile.full_name ?? "").split(" ")[0];
  const isEmpty = o.activeClients + o.prospects + o.openProjects === 0;

  return (
    <>
      <PageHeader
        eyebrow={`${longDay(today)} · ${ws.organization.timezone.replace("_", " ")}`}
        title={firstName ? `Hi, ${firstName}` : "Overview"}
        description={`What's happening at ${ws.organization.name}, from live records you have access to.`}
        actions={
          can(ws.role, "projects:write") ? (
            <ButtonLink href="/projects/new">
              <Plus aria-hidden className="size-4" /> New project
            </ButtonLink>
          ) : can(ws.role, "clients:write") ? (
            <ButtonLink href="/clients/new">
              <Plus aria-hidden className="size-4" /> New client
            </ButtonLink>
          ) : null
        }
      />

      {isEmpty ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="Your workspace is ready"
            action={can(ws.role, "clients:write") ? <ButtonLink href="/clients/new">Add your first client</ButtonLink> : null}
          >
            {can(ws.role, "clients:write")
              ? "Start by adding a client, then create a project for them. Everything on this page is counted from those records."
              : "Nothing is assigned to you yet. Projects you're added to will show up here."}
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat label="Active clients" value={o.activeClients} hint={`${o.prospects} prospect${o.prospects === 1 ? "" : "s"}`} href="/clients?status=active" />
            <Stat label="Open projects" value={o.openProjects} hint="Planning, in progress or on hold" href="/projects" />
            <Stat label="Due in 14 days" value={o.dueSoon} hint="Open projects with a due date" href="/projects" />
            <Stat label="Overdue" value={o.overdue} hint="Open projects past their due date" href="/projects" tone="critical" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card title="Coming up" description="Open projects due in the next 14 days, and anything overdue." padded={false}>
              {o.upcoming.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Nothing due soon">
                  No open project is due in the next two weeks.
                </EmptyState>
              ) : (
                <ul className="divide-y divide-border">
                  {o.upcoming.map((p) => {
                    const days = daysBetween(today, p.due_date!);
                    const s = PROJECT_STATUS[p.status];
                    return (
                      <li key={p.id}>
                        <Link href={`/projects/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-muted">
                          <FolderKanban aria-hidden className="size-4 shrink-0 text-brand" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{p.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{p.client?.name}</span>
                          </span>
                          <Badge tone={s.tone} icon={s.icon}>
                            {s.label}
                          </Badge>
                          <span className={`tabular w-28 text-right text-[13px] ${days < 0 ? "font-semibold text-status-critical" : "text-muted-foreground"}`}>
                            {days < 0 ? (
                              <>
                                <TriangleExclamationPoint aria-hidden className="mr-1 inline size-3.5" />
                                {-days}d overdue
                              </>
                            ) : days === 0 ? (
                              "Due today"
                            ) : (
                              `${formatDay(p.due_date, today)} · ${days}d`
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div className="space-y-6">
              {can(ws.role, "finance:read") && (
                <Card title="Money, year to date" description={money ? `QuickBooks snapshot, ${formatDay(money.period_end)}. Not live.` : undefined}>
                  {money ? (
                    <>
                      <dl className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <dt className="text-xs font-semibold text-muted-foreground">Revenue</dt>
                          <dd className="tabular text-lg font-bold">{whole(money.data.headline.revenue_cents)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-muted-foreground">Net result</dt>
                          <dd className={`tabular text-lg font-bold ${money.data.headline.net_result_cents < 0 ? "text-status-critical" : ""}`}>
                            {whole(money.data.headline.net_result_cents)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-muted-foreground">To collect</dt>
                          <dd className="tabular text-lg font-bold">{whole(money.data.headline.receivables_cents)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold text-muted-foreground">In the bank</dt>
                          <dd className="tabular text-lg font-bold">{whole(money.data.headline.bank_balance_cents)}</dd>
                        </div>
                      </dl>
                      <Link href="/finance" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-link hover:text-link-hover hover:underline">
                        <Wallet aria-hidden className="size-4" /> Open Finance
                      </Link>
                    </>
                  ) : (
                    <div className="flex gap-3 text-sm">
                      <Wallet aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                      <p className="text-muted-foreground">Company figures appear here once a report from the accounting system is imported. Nothing is estimated.</p>
                    </div>
                  )}
                </Card>
              )}
              <Card title="Shortcuts">
                <ul className="space-y-2 text-sm">
                  <li>
                    <Link href="/clients" className="inline-flex items-center gap-2 font-medium text-link hover:text-link-hover hover:underline">
                      <Building aria-hidden className="size-4" /> All clients
                    </Link>
                  </li>
                  <li>
                    <Link href="/projects" className="inline-flex items-center gap-2 font-medium text-link hover:text-link-hover hover:underline">
                      <FolderKanban aria-hidden className="size-4" /> All projects
                    </Link>
                  </li>
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}

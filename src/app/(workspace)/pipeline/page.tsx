import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { formatDay, todayIn } from "@/lib/format";
import { formatMoney, formatMoneyWhole } from "@/lib/money";
import { PipelineBoard, type BoardDeal } from "@/features/pipeline/board";
import { followUpState, LEAD_SOURCES, sourceLabel, weightedValue, type LeadSource } from "@/features/pipeline/model";
import { listDeals, listStages } from "@/features/pipeline/queries";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Pipeline" };

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "critical" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
      <p className={`display tabular mt-1.5 text-2xl font-bold leading-none ${tone === "critical" ? "text-status-critical" : ""}`}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const ws = await requirePermission("pipeline:read");
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "board";
  const mine = params.mine === "1";
  const source = LEAD_SOURCES.some((s) => s.value === params.source) ? (params.source as LeadSource) : null;

  const [stages, allDeals, roster] = await Promise.all([listStages(ws.organization.id), listDeals(ws.organization.id), getRoster(ws.organization.id)]);
  const deals = allDeals.filter((d) => (!mine || d.owner_id === ws.user.id) && (!source || d.source === source));
  const people = new Map(roster.map((m) => [m.user_id, memberLabel(m)]));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const today = todayIn(ws.organization.timezone);
  const cur = ws.organization.default_currency;
  const whole = (c: number) => formatMoneyWhole({ cents: c, currency: cur });
  const canWrite = can(ws.role, "pipeline:write");

  const open = deals.filter((d) => stageById.get(d.stage_id)?.kind === "open");
  const openValue = open.reduce((a, d) => a + (d.value_cents ?? 0), 0);
  const weighted = weightedValue(deals.map((d) => ({ value_cents: d.value_cents, probability_bps: stageById.get(d.stage_id)?.probability_bps ?? 0, kind: stageById.get(d.stage_id)?.kind ?? "open" })));
  const year = today.slice(0, 4);
  const wonThisYear = deals.filter((d) => stageById.get(d.stage_id)?.kind === "won" && d.closed_on?.startsWith(year));
  const due = open.filter((d) => ["overdue", "today"].includes(followUpState(d.next_follow_up_on, today)));

  const href = (changes: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const next = { view: view === "list" ? "list" : null, mine: mine ? "1" : null, source, ...changes };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/pipeline?${qs}` : "/pipeline";
  };

  const boardDeals: BoardDeal[] = deals.map((d) => ({
    id: d.id,
    title: d.title,
    stageId: d.stage_id,
    valueCents: d.value_cents,
    clientName: d.client?.name ?? "—",
    ownerName: d.owner_id ? (people.get(d.owner_id) ?? null) : null,
    followUp: stageById.get(d.stage_id)?.kind === "open" && d.next_follow_up_on ? formatDay(d.next_follow_up_on, today) : null,
    followUpState: stageById.get(d.stage_id)?.kind === "open" ? followUpState(d.next_follow_up_on, today) : "none",
  }));

  const chip = "rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-pink-100 aria-[current=page]:text-foreground";

  return (
    <>
      <PageHeader
        title="Pipeline"
        description="Every deal from first contact to won or lost. Values are estimates before ITBMS."
        actions={
          canWrite && (
            <ButtonLink href="/pipeline/new">
              <Plus aria-hidden className="size-4" /> New deal
            </ButtonLink>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open deals" value={String(open.length)} sub={`${whole(openValue)} estimated`} />
        <Stat label="Weighted pipeline" value={whole(weighted)} sub="Each deal × its stage's chance of winning" />
        <Stat label={`Won in ${year}`} value={whole(wonThisYear.reduce((a, d) => a + (d.value_cents ?? 0), 0))} sub={`${wonThisYear.length} deal${wonThisYear.length === 1 ? "" : "s"}`} />
        <Stat label="Follow-ups due" value={String(due.length)} sub="Overdue or due today" tone={due.length ? "critical" : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="View" className="flex gap-1 rounded-lg border border-border bg-card p-1">
          <Link href={href({ view: null })} aria-current={view === "board" ? "page" : undefined} className={chip}>
            Board
          </Link>
          <Link href={href({ view: "list" })} aria-current={view === "list" ? "page" : undefined} className={chip}>
            List
          </Link>
        </nav>
        <Link href={href({ mine: mine ? null : "1" })} aria-pressed={mine} className="rounded-md border border-border bg-card px-3 py-2 text-[13px] font-medium hover:bg-accent aria-pressed:border-brand aria-pressed:bg-pink-100">
          {mine ? "✓ " : ""}Only mine
        </Link>
        <nav aria-label="Source" className="flex flex-wrap gap-1">
          <Link href={href({ source: null })} aria-current={!source ? "page" : undefined} className={chip}>
            All sources
          </Link>
          {LEAD_SOURCES.filter((s) => allDeals.some((d) => d.source === s.value)).map((s) => (
            <Link key={s.value} href={href({ source: s.value })} aria-current={source === s.value ? "page" : undefined} className={chip}>
              {s.label}
            </Link>
          ))}
        </nav>
      </div>

      {allDeals.length === 0 ? (
        <Card>
          <EmptyState icon={Target} title="No deals yet" action={canWrite ? <ButtonLink href="/pipeline/new">Add the first deal</ButtonLink> : null}>
            Track every lead from first conversation to signed project. Won deals become projects in one click.
          </EmptyState>
        </Card>
      ) : view === "board" ? (
        <PipelineBoard stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))} deals={boardDeals} canMove={canWrite} />
      ) : (
        <Card padded={false}>
          {deals.length === 0 ? (
            <EmptyState icon={Target} title="No deals match" />
          ) : (
            <Table label="Deals">
              <thead>
                <tr>
                  <Th>Deal</Th>
                  <Th>Stage</Th>
                  <Th className="text-right">Value</Th>
                  <Th>Owner</Th>
                  <Th>Source</Th>
                  <Th>Next follow-up</Th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => {
                  const s = stageById.get(d.stage_id);
                  const fu = s?.kind === "open" ? followUpState(d.next_follow_up_on, today) : "none";
                  return (
                    <tr key={d.id} className="hover:bg-muted/60">
                      <Td>
                        <Link href={`/pipeline/${d.id}`} className="font-semibold hover:text-link hover:underline">
                          {d.title}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{d.client?.name}</span>
                      </Td>
                      <Td>
                        <Badge tone={s?.kind === "won" ? "good" : s?.kind === "lost" ? "neutral" : "info"}>{s?.name}</Badge>
                      </Td>
                      <Td className="tabular text-right">{d.value_cents !== null ? formatMoney({ cents: d.value_cents, currency: d.currency }) : "—"}</Td>
                      <Td className="text-muted-foreground">{d.owner_id ? (people.get(d.owner_id) ?? "—") : "—"}</Td>
                      <Td className="text-muted-foreground">{sourceLabel(d.source)}</Td>
                      <Td className={`tabular ${fu === "overdue" ? "font-semibold text-status-critical" : fu === "today" ? "font-semibold text-status-warning" : "text-muted-foreground"}`}>
                        {s?.kind === "open" && d.next_follow_up_on ? `${fu === "overdue" ? "Overdue · " : fu === "today" ? "Today · " : ""}${formatDay(d.next_follow_up_on, today)}` : "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

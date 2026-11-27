import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightLeft, FolderKanban, Mail, MessageSquare, Pencil, Phone, Trash, Users } from "lucide-react";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { formatDay, formatMoment, todayIn } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { addActivityAction, createProjectFromDealAction, deleteActivityAction } from "@/features/pipeline/actions";
import { ActivityForm } from "@/features/pipeline/activity-form";
import { followUpState, sourceLabel } from "@/features/pipeline/model";
import { getDeal, listActivities, listPartnerOptions, listStages } from "@/features/pipeline/queries";
import { StageSwitcher } from "@/features/pipeline/stage-switcher";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Deal" };

const KIND_ICON = { note: MessageSquare, call: Phone, email: Mail, meeting: Users, stage_change: ArrowRightLeft } as const;
const KIND_LABEL = { note: "Note", call: "Call", email: "Email", meeting: "Meeting", stage_change: "Stage" } as const;

export default async function DealPage({ params }: PageProps<"/pipeline/[id]">) {
  const ws = await requirePermission("pipeline:read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [deal, stages, activities, roster, partners] = await Promise.all([
    getDeal(ws.organization.id, id),
    listStages(ws.organization.id),
    listActivities(ws.organization.id, { opportunityId: id }),
    getRoster(ws.organization.id),
    listPartnerOptions(ws.organization.id),
  ]);
  if (!deal) notFound();

  const stage = stages.find((s) => s.id === deal.stage_id);
  const people = new Map(roster.map((m) => [m.user_id, memberLabel(m)]));
  const today = todayIn(ws.organization.timezone);
  const canWrite = can(ws.role, "pipeline:write");
  const fu = stage?.kind === "open" ? followUpState(deal.next_follow_up_on, today) : "none";
  const broughtBy = partners.find((p) => p.value === deal.brought_by_partner_id)?.label;

  return (
    <>
      <PageHeader
        back={{ href: "/pipeline", label: "Pipeline" }}
        eyebrow={
          deal.client ? (
            <Link href={`/clients/${deal.client.id}`} className="hover:text-link hover:underline">
              {deal.client.name}
            </Link>
          ) : undefined
        }
        title={deal.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={stage?.kind === "won" ? "good" : stage?.kind === "lost" ? "neutral" : "info"}>{stage?.name}</Badge>
            <span className="tabular font-semibold text-foreground">{deal.value_cents !== null ? formatMoney({ cents: deal.value_cents, currency: deal.currency }) : "No value yet"}</span>
            {deal.owner_id && <span>Owner: {people.get(deal.owner_id) ?? "—"}</span>}
          </span>
        }
        actions={
          canWrite && (
            <ButtonLink href={`/pipeline/${id}/edit`} variant="secondary">
              <Pencil aria-hidden className="size-4" /> Edit
            </ButtonLink>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {stage?.kind === "won" && (
            <Card title={deal.won_project_id ? "Won · project created" : "Won · next step"}>
              {deal.won_project_id ? (
                <Link href={`/projects/${deal.won_project_id}`} className="inline-flex items-center gap-2 text-sm font-medium text-link hover:underline">
                  <FolderKanban aria-hidden className="size-4" /> Open the project
                </Link>
              ) : can(ws.role, "projects:write") ? (
                <form action={createProjectFromDealAction.bind(null, id)} className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-muted-foreground">Create the project for {deal.client?.name}. The client becomes active and the deal links to it.</p>
                  <Button type="submit">
                    <FolderKanban aria-hidden className="size-4" /> Create project
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">An admin or project manager can create the project from this deal.</p>
              )}
            </Card>
          )}

          {canWrite && (
            <Card title="Stage">
              <StageSwitcher dealId={id} current={deal.stage_id} stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))} />
              {stage?.kind === "lost" && deal.lost_reason && <p className="mt-3 text-sm text-muted-foreground">Lost because: {deal.lost_reason}</p>}
            </Card>
          )}

          <Card title="Timeline" description="Notes, calls, emails, meetings and stage changes." padded={false}>
            {canWrite && (
              <div className="border-b border-border p-5">
                <ActivityForm action={addActivityAction.bind(null, id, deal.client_id)} />
              </div>
            )}
            {activities.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ol className="divide-y divide-border">
                {activities.map((a) => {
                  const Icon = KIND_ICON[a.kind];
                  const mineOrAdmin = a.created_by === ws.user.id || ws.role === "admin";
                  return (
                    <li key={a.id} className="flex gap-3 px-5 py-3.5">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-pink-100 text-brand">
                        <Icon aria-hidden className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{KIND_LABEL[a.kind]}</span> · {a.created_by ? (people.get(a.created_by) ?? "Someone") : "System"} ·{" "}
                          {formatMoment(a.occurred_at, ws.organization.timezone)}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm">{a.body}</p>
                      </div>
                      {a.kind !== "stage_change" && mineOrAdmin && (
                        <form action={deleteActivityAction.bind(null, a.id, id)}>
                          <button type="submit" aria-label="Delete this entry" title="Delete" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-status-critical">
                            <Trash aria-hidden className="size-3.5" />
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <Card title="Details">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Next follow-up</dt>
              <dd className={fu === "overdue" ? "font-semibold text-status-critical" : fu === "today" ? "font-semibold text-status-warning" : ""}>
                {deal.next_follow_up_on ? `${fu === "overdue" ? "Overdue · " : fu === "today" ? "Today · " : ""}${formatDay(deal.next_follow_up_on, today)}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Expected close</dt>
              <dd>{formatDay(deal.expected_close_on, today)}</dd>
            </div>
            {deal.closed_on && (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Closed</dt>
                <dd>{formatDay(deal.closed_on, today)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Source</dt>
              <dd>
                {sourceLabel(deal.source)}
                {deal.source_detail ? ` · ${deal.source_detail}` : ""}
              </dd>
            </div>
            {broughtBy && (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Brought in by</dt>
                <dd>{broughtBy}</dd>
              </div>
            )}
            {deal.contact && (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Contact</dt>
                <dd>
                  {deal.contact.full_name}
                  {deal.contact.email && (
                    <a href={`mailto:${deal.contact.email}`} className="block text-link hover:underline">
                      {deal.contact.email}
                    </a>
                  )}
                </dd>
              </div>
            )}
            {deal.notes && (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-wrap">{deal.notes}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </>
  );
}

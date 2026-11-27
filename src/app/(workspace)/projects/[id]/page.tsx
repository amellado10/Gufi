import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, UserMinus } from "lucide-react";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { can, ROLE_LABELS } from "@/lib/roles";
import { daysBetween, formatDay, formatMoment, initials, todayIn } from "@/lib/format";
import { assignMemberAction, removeMemberAction, setProjectStatusAction } from "@/features/projects/actions";
import { AssignForm } from "@/features/projects/assign-form";
import { getProjectDetail } from "@/features/projects/queries";
import { PROJECT_STATUS, PROJECT_STATUSES } from "@/features/projects/status";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const ws = await requireWorkspace();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [project, roster] = await Promise.all([getProjectDetail(ws.organization.id, id), getRoster(ws.organization.id)]);
  if (!project) notFound();

  const s = PROJECT_STATUS[project.status];
  const today = todayIn(ws.organization.timezone);
  const open = ["planning", "active", "on_hold"].includes(project.status);
  const days = project.due_date ? daysBetween(today, project.due_date) : null;
  const memberIds = new Set((project.project_members ?? []).map((m) => m.user_id));
  const team = roster.filter((m) => memberIds.has(m.user_id));
  const owner = roster.find((m) => m.user_id === project.owner_id);
  const canWrite = can(ws.role, "projects:write");
  const canAssign = can(ws.role, "projects:assign");

  return (
    <>
      <PageHeader
        back={{ href: "/projects", label: "Projects" }}
        eyebrow={
          project.client ? (
            <Link href={`/clients/${project.client.id}`} className="hover:text-link hover:underline">
              {project.client.name}
            </Link>
          ) : undefined
        }
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={s.tone} icon={s.icon}>
              {s.label}
            </Badge>
            {owner && <span>Owner: {memberLabel(owner)}</span>}
          </span>
        }
        actions={
          canWrite && (
            <ButtonLink href={`/projects/${id}/edit`} variant="secondary">
              <Pencil aria-hidden className="size-4" /> Edit
            </ButtonLink>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card title="Overview">
            {project.description ? (
              <p className="whitespace-pre-wrap text-sm">{project.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description yet.</p>
            )}
            <dl className="mt-5 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Start</dt>
                <dd className="tabular">{formatDay(project.start_date, today)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Due</dt>
                <dd className="tabular">
                  {formatDay(project.due_date, today)}
                  {open && days !== null && (
                    <span className={days < 0 ? " font-semibold text-status-critical" : " text-muted-foreground"}>
                      {days < 0 ? ` · ${-days}d overdue` : days === 0 ? " · today" : ` · in ${days}d`}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Last updated</dt>
                <dd className="tabular">{formatMoment(project.updated_at, ws.organization.timezone)}</dd>
              </div>
            </dl>
          </Card>

          {canWrite && (
            <Card title="Status" description="Changes are recorded in the audit log.">
              <div className="flex flex-wrap gap-2">
                {PROJECT_STATUSES.map((st) => {
                  const info = PROJECT_STATUS[st];
                  const current = st === project.status;
                  return (
                    <form key={st} action={setProjectStatusAction.bind(null, id, st)}>
                      <button
                        type="submit"
                        disabled={current}
                        aria-pressed={current}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium hover:bg-accent aria-pressed:border-brand aria-pressed:bg-pink-100 aria-pressed:font-semibold"
                      >
                        <info.icon aria-hidden className="size-3.5" />
                        {info.label}
                      </button>
                    </form>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title="Coming to projects" description="Next on the roadmap for this page.">
            <p className="text-sm text-muted-foreground">
              Tasks and boards, milestones, time tracking, the accepted proposal and the budget baseline will live here as those modules ship.
            </p>
          </Card>
        </div>

        <Card title="Team" description={`${team.length} ${team.length === 1 ? "person" : "people"}`} padded={false}>
          <ul className="divide-y divide-border">
            {team.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-5 py-3">
                <span aria-hidden className="gufi-corner flex size-8 shrink-0 items-center justify-center bg-pink-100 text-[11px] font-bold text-foreground">
                  {initials(m.full_name, m.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{memberLabel(m)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.title || ROLE_LABELS[m.role]}</span>
                </span>
                {canAssign && (
                  <form action={removeMemberAction.bind(null, id, m.user_id)}>
                    <button
                      type="submit"
                      aria-label={`Remove ${memberLabel(m)} from the project`}
                      title="Remove from project"
                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-status-critical"
                    >
                      <UserMinus aria-hidden className="size-4" />
                    </button>
                  </form>
                )}
              </li>
            ))}
            {team.length === 0 && <li className="px-5 py-4 text-sm text-muted-foreground">No one is assigned yet.</li>}
          </ul>
          {canAssign && (
            <div className="border-t border-border p-5">
              <AssignForm
                action={assignMemberAction.bind(null, id)}
                options={roster.filter((m) => !memberIds.has(m.user_id)).map((m) => ({ value: m.user_id, label: `${memberLabel(m)} · ${ROLE_LABELS[m.role]}` }))}
              />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

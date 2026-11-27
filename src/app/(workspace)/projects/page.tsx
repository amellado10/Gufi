import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, Plus, TriangleExclamationPoint } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { can } from "@/lib/roles";
import { daysBetween, formatDay, todayIn } from "@/lib/format";
import { listProjects } from "@/features/projects/queries";
import { PROJECT_STATUS, PROJECT_STATUSES, type ProjectStatus } from "@/features/projects/status";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Projects" };

const FILTERS: { value: "open" | "all" | ProjectStatus; label: string }[] = [
  { value: "open", label: "Open" },
  ...PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS[s].label })),
  { value: "all", label: "All" },
];

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const ws = await requireWorkspace();
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.value === params.status)?.value ?? "open";
  const mine = params.mine === "1";
  const [projects, roster] = await Promise.all([
    listProjects(ws.organization.id, { status: filter === "all" ? undefined : filter, memberId: mine ? ws.user.id : undefined }),
    getRoster(ws.organization.id),
  ]);
  const people = new Map(roster.map((m) => [m.user_id, memberLabel(m)]));
  const today = todayIn(ws.organization.timezone);
  const href = (status: string, m = mine) => `/projects?status=${status}${m ? "&mine=1" : ""}`;

  return (
    <>
      <PageHeader
        title="Projects"
        description={can(ws.role, "projects:read-all") ? "All client work, soonest due first." : "Projects you're assigned to."}
        actions={
          can(ws.role, "projects:write") && (
            <ButtonLink href="/projects/new">
              <Plus aria-hidden className="size-4" /> New project
            </ButtonLink>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={href(f.value)}
              aria-current={f.value === filter ? "page" : undefined}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-[current=page]:bg-pink-100 aria-[current=page]:text-foreground"
            >
              {f.label}
            </Link>
          ))}
        </nav>
        {can(ws.role, "projects:read-all") && (
          <Link href={href(filter, !mine)} aria-pressed={mine} className="rounded-md border border-border bg-card px-3 py-2 text-[13px] font-medium hover:bg-accent aria-pressed:border-brand aria-pressed:bg-pink-100">
            {mine ? "✓ " : ""}Only mine
          </Link>
        )}
      </div>

      <Card padded={false}>
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={filter === "open" && !mine ? "No open projects" : "No projects match"}
            action={can(ws.role, "projects:write") && filter === "open" ? <ButtonLink href="/projects/new">Create a project</ButtonLink> : null}
          >
            {ws.role === "team" ? "Projects show up here when a project manager adds you." : "Try another filter, or create a project from a client's page."}
          </EmptyState>
        ) : (
          <Table label="Projects">
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Status</Th>
                <Th>Owner</Th>
                <Th className="text-right">Due</Th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const s = PROJECT_STATUS[p.status];
                const open = ["planning", "active", "on_hold"].includes(p.status);
                const days = p.due_date ? daysBetween(today, p.due_date) : null;
                return (
                  <tr key={p.id} className="hover:bg-muted/60">
                    <Td>
                      <Link href={`/projects/${p.id}`} className="font-semibold hover:text-link hover:underline">
                        {p.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{p.client?.name}</span>
                    </Td>
                    <Td>
                      <Badge tone={s.tone} icon={s.icon}>
                        {s.label}
                      </Badge>
                    </Td>
                    <Td className="text-muted-foreground">{p.owner_id ? (people.get(p.owner_id) ?? "—") : "—"}</Td>
                    <Td className="tabular text-right">
                      {p.due_date ? (
                        open && days !== null && days < 0 ? (
                          <span className="font-semibold text-status-critical">
                            <TriangleExclamationPoint aria-hidden className="mr-1 inline size-3.5" />
                            {formatDay(p.due_date, today)} · {-days}d overdue
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{formatDay(p.due_date, today)}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

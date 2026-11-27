import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderKanban, Globe, Mail, Pencil, Phone, Plus, Target, Users } from "lucide-react";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { can } from "@/lib/roles";
import { formatDay, formatMoment, todayIn } from "@/lib/format";
import { addContactAction } from "@/features/clients/actions";
import { ContactForm } from "@/features/clients/contact-form";
import { getClientDetail, listContacts } from "@/features/clients/queries";
import { CLIENT_STATUS } from "@/features/clients/status";
import { listProjects } from "@/features/projects/queries";
import { PROJECT_STATUS } from "@/features/projects/status";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { listDeals, listStages } from "@/features/pipeline/queries";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const ws = await requireWorkspace();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const canContacts = can(ws.role, "contacts:read");
  const seesPipeline = can(ws.role, "pipeline:read");
  const [client, contacts, projects, roster, deals, stages] = await Promise.all([
    getClientDetail(ws.organization.id, id),
    canContacts ? listContacts(ws.organization.id, id) : Promise.resolve([]),
    listProjects(ws.organization.id, { clientId: id }),
    getRoster(ws.organization.id),
    seesPipeline ? listDeals(ws.organization.id, { clientId: id }) : Promise.resolve([]),
    seesPipeline ? listStages(ws.organization.id) : Promise.resolve([]),
  ]);
  const stageById = new Map(stages.map((st) => [st.id, st]));
  if (!client) notFound();
  const s = CLIENT_STATUS[client.status];
  const owner = roster.find((m) => m.user_id === client.owner_id);
  const today = todayIn(ws.organization.timezone);

  return (
    <>
      <PageHeader
        back={{ href: "/clients", label: "Clients" }}
        title={client.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={s.tone} icon={s.icon}>
              {s.label}
            </Badge>
            {client.industry && <span>{client.industry}</span>}
            {owner && <span>Owner: {memberLabel(owner)}</span>}
          </span>
        }
        actions={
          <>
            {can(ws.role, "clients:write") && (
              <ButtonLink href={`/clients/${id}/edit`} variant="secondary">
                <Pencil aria-hidden className="size-4" /> Edit
              </ButtonLink>
            )}
            {can(ws.role, "projects:write") && (
              <ButtonLink href={`/projects/new?client=${id}`}>
                <Plus aria-hidden className="size-4" /> New project
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card title="Projects" padded={false}>
            {projects.length === 0 ? (
              <EmptyState icon={FolderKanban} title="No projects yet">
                {can(ws.role, "projects:write") ? "Create the first project for this client." : "No projects you can see."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-border">
                {projects.map((p) => {
                  const ps = PROJECT_STATUS[p.status];
                  return (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-muted">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.name}</span>
                        <Badge tone={ps.tone} icon={ps.icon}>
                          {ps.label}
                        </Badge>
                        <span className="tabular w-24 text-right text-[13px] text-muted-foreground">{p.due_date ? `Due ${formatDay(p.due_date, today)}` : "No due date"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {seesPipeline && (
            <Card
              title="Deals"
              padded={false}
              action={
                can(ws.role, "pipeline:write") ? (
                  <Link href={`/pipeline/new?client=${id}`} className="text-sm font-medium text-link hover:underline">
                    New deal
                  </Link>
                ) : undefined
              }
            >
              {deals.length === 0 ? (
                <EmptyState icon={Target} title="No deals yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {deals.map((d) => {
                    const st = stageById.get(d.stage_id);
                    return (
                      <li key={d.id}>
                        <Link href={`/pipeline/${d.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-muted">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{d.title}</span>
                          <Badge tone={st?.kind === "won" ? "good" : st?.kind === "lost" ? "neutral" : "info"}>{st?.name}</Badge>
                          <span className="tabular w-24 text-right text-[13px] text-muted-foreground">
                            {d.value_cents !== null ? formatMoney({ cents: d.value_cents, currency: d.currency }) : "—"}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {canContacts && (
            <Card title="Contacts" description="People at this client." padded={false}>
              {contacts.length === 0 ? (
                <EmptyState icon={Users} title="No contacts yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {c.full_name}
                          {c.email?.endsWith("@example.com") && (
                            <span className="ml-2 rounded border border-status-warning/40 px-1.5 text-[10px] font-semibold text-status-warning">Placeholder</span>
                          )}
                        </span>
                        {c.title && <span className="block text-xs text-muted-foreground">{c.title}</span>}
                      </span>
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-[13px] text-link hover:underline">
                          <Mail aria-hidden className="size-3.5" />
                          {c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-[13px] text-link hover:underline">
                          <Phone aria-hidden className="size-3.5" />
                          {c.phone}
                        </a>
                      )}
                      {can(ws.role, "contacts:write") && (
                        <Link href={`/clients/${id}/contacts/${c.id}`} className="text-[13px] font-medium text-link hover:underline">
                          Edit
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {can(ws.role, "contacts:write") && (
                <div className="border-t border-border p-5">
                  <h3 className="mb-3 text-sm font-bold">Add a contact</h3>
                  <ContactForm action={addContactAction.bind(null, id)} />
                </div>
              )}
            </Card>
          )}
        </div>

        <Card title="Details">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Website</dt>
              <dd>
                {client.website ? (
                  <a href={client.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                    <Globe aria-hidden className="size-3.5" />
                    {client.domain}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Legal name</dt>
              <dd>{client.legal_name || "—"}</dd>
            </div>
            {client.notes && (
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Internal notes</dt>
                <dd className="whitespace-pre-wrap">{client.notes}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Added</dt>
              <dd className="tabular">{formatMoment(client.created_at, ws.organization.timezone)}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Building, Plus, Search } from "lucide-react";
import { requireWorkspace } from "@/lib/auth";
import { can } from "@/lib/roles";
import { formatMoment } from "@/lib/format";
import { listClients } from "@/features/clients/queries";
import { CLIENT_STATUS, CLIENT_STATUSES, type ClientStatus } from "@/features/clients/status";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const ws = await requireWorkspace();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status = CLIENT_STATUSES.includes(params.status as ClientStatus) ? (params.status as ClientStatus) : undefined;
  const [clients, roster] = await Promise.all([listClients(ws.organization.id, { q, status }), getRoster(ws.organization.id)]);
  const people = new Map(roster.map((m) => [m.user_id, memberLabel(m)]));
  const canWrite = can(ws.role, "clients:write");
  const filtered = Boolean(q || status);

  return (
    <>
      <PageHeader
        title="Clients"
        description={ws.role === "team" ? "Clients of the projects you're assigned to." : "Every company Güfi works with or is talking to."}
        actions={
          canWrite && (
            <ButtonLink href="/clients/new">
              <Plus aria-hidden className="size-4" /> New client
            </ButtonLink>
          )
        }
      />

      <form role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Search clients</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by name or website"
            className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground/80"
          />
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select name="status" defaultValue={status ?? ""} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
            <option value="">All statuses</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUS[s].label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonClass("secondary")}>
          Apply
        </button>
        {filtered && (
          <Link href="/clients" className="px-2 text-sm font-medium text-link hover:underline">
            Clear
          </Link>
        )}
      </form>

      <Card padded={false}>
        {clients.length === 0 ? (
          <EmptyState
            icon={Building}
            title={filtered ? "No clients match" : "No clients yet"}
            action={!filtered && canWrite ? <ButtonLink href="/clients/new">Add a client</ButtonLink> : null}
          >
            {filtered ? "Try a different search or status." : canWrite ? "Add the companies Güfi works with to start tracking projects." : "Nothing to show for your role yet."}
          </EmptyState>
        ) : (
          <Table label="Clients">
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Open projects</Th>
                <Th>Owner</Th>
                <Th className="text-right">Updated</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const s = CLIENT_STATUS[c.status];
                const open = (c.projects ?? []).filter((p) => ["planning", "active", "on_hold"].includes(p.status)).length;
                return (
                  <tr key={c.id} className="hover:bg-muted/60">
                    <Td>
                      <Link href={`/clients/${c.id}`} className="font-semibold hover:text-link hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{[c.domain, c.industry].filter(Boolean).join(" · ") || "—"}</span>
                    </Td>
                    <Td>
                      <Badge tone={s.tone} icon={s.icon}>
                        {s.label}
                      </Badge>
                    </Td>
                    <Td className="tabular">{open}</Td>
                    <Td className="text-muted-foreground">{c.owner_id ? (people.get(c.owner_id) ?? "—") : "—"}</Td>
                    <Td className="tabular text-right text-muted-foreground">{formatMoment(c.updated_at, ws.organization.timezone)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {clients.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {clients.length} client{clients.length === 1 ? "" : "s"}
          {filtered ? " match" : ""}
        </p>
      )}
    </>
  );
}

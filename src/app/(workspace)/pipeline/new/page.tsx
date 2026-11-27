import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { createDealAction } from "@/features/pipeline/actions";
import { DealForm } from "@/features/pipeline/deal-form";
import { listContactOptions, listPartnerOptions, listStages } from "@/features/pipeline/queries";
import { clientOptions } from "@/features/clients/queries";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "New deal" };

export default async function NewDealPage({ searchParams }: PageProps<"/pipeline/new">) {
  const ws = await requirePermission("pipeline:write");
  const { client } = await searchParams;
  const [stages, clients, contacts, roster, partners] = await Promise.all([
    listStages(ws.organization.id),
    clientOptions(ws.organization.id),
    listContactOptions(ws.organization.id),
    getRoster(ws.organization.id),
    listPartnerOptions(ws.organization.id),
  ]);
  const preselected = typeof client === "string" && clients.some((c) => c.id === client) ? client : "";
  return (
    <>
      <PageHeader back={{ href: "/pipeline", label: "Pipeline" }} title="New deal" />
      <Card className="max-w-3xl">
        <DealForm
          action={createDealAction}
          defaults={{ client_id: preselected, owner_id: ws.user.id, stage_id: stages.find((s) => s.kind === "open")?.id }}
          clients={clients.map((c) => ({ value: c.id, label: c.name }))}
          contacts={contacts.map((c) => ({ value: c.id, label: c.full_name, clientId: c.client_id }))}
          stages={stages.map((s) => ({ value: s.id, label: s.name, kind: s.kind }))}
          owners={roster.map((m) => ({ value: m.user_id, label: memberLabel(m) }))}
          partners={partners}
          cancelHref="/pipeline"
          submitLabel="Create deal"
        />
      </Card>
    </>
  );
}

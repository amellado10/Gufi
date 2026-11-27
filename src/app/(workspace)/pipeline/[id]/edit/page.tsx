import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { updateDealAction } from "@/features/pipeline/actions";
import { DealForm } from "@/features/pipeline/deal-form";
import { getDeal, listContactOptions, listPartnerOptions, listStages } from "@/features/pipeline/queries";
import { clientOptions } from "@/features/clients/queries";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Edit deal" };

export default async function EditDealPage({ params }: PageProps<"/pipeline/[id]/edit">) {
  const ws = await requirePermission("pipeline:write");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [deal, stages, clients, contacts, roster, partners] = await Promise.all([
    getDeal(ws.organization.id, id),
    listStages(ws.organization.id),
    clientOptions(ws.organization.id),
    listContactOptions(ws.organization.id),
    getRoster(ws.organization.id),
    listPartnerOptions(ws.organization.id),
  ]);
  if (!deal) notFound();
  const clientList = deal.client && !clients.some((c) => c.id === deal.client_id) ? [...clients, { id: deal.client.id, name: deal.client.name }] : clients;
  return (
    <>
      <PageHeader back={{ href: `/pipeline/${id}`, label: deal.title }} title="Edit deal" />
      <Card className="max-w-3xl">
        <DealForm
          action={updateDealAction.bind(null, id)}
          defaults={{
            client_id: deal.client_id,
            title: deal.title,
            stage_id: deal.stage_id,
            value: deal.value_cents !== null ? (deal.value_cents / 100).toFixed(2) : "",
            owner_id: deal.owner_id,
            contact_id: deal.contact_id,
            source: deal.source,
            source_detail: deal.source_detail,
            brought_by_partner_id: deal.brought_by_partner_id,
            expected_close_on: deal.expected_close_on,
            next_follow_up_on: deal.next_follow_up_on,
            lost_reason: deal.lost_reason,
            notes: deal.notes,
          }}
          clients={clientList.map((c) => ({ value: c.id, label: c.name }))}
          contacts={contacts.map((c) => ({ value: c.id, label: c.full_name, clientId: c.client_id }))}
          stages={stages.map((s) => ({ value: s.id, label: s.name, kind: s.kind }))}
          owners={roster.map((m) => ({ value: m.user_id, label: memberLabel(m) }))}
          partners={partners}
          cancelHref={`/pipeline/${id}`}
          submitLabel="Save changes"
        />
      </Card>
    </>
  );
}

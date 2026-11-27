import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { clientOptions } from "@/features/clients/queries";
import { listDeals, listStages } from "@/features/pipeline/queries";
import { NewProposalForm } from "@/features/proposals/new-proposal-form";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "New proposal" };

export default async function NewProposalPage({ searchParams }: PageProps<"/proposals/new">) {
  const ws = await requirePermission("pipeline:write");
  const { deal } = await searchParams;
  const [clients, deals, stages] = await Promise.all([clientOptions(ws.organization.id), listDeals(ws.organization.id), listStages(ws.organization.id)]);
  const open = new Set(stages.filter((s) => s.kind === "open").map((s) => s.id));
  const openDeals = deals.filter((d) => open.has(d.stage_id) && d.client);
  const fromDeal = typeof deal === "string" ? deals.find((d) => d.id === deal) : undefined;
  const clientList = fromDeal?.client && !clients.some((c) => c.id === fromDeal.client!.id) ? [...clients, { id: fromDeal.client.id, name: fromDeal.client.name }] : clients;

  return (
    <>
      <PageHeader back={{ href: "/proposals", label: "Proposals" }} title="New proposal" />
      <Card className="max-w-3xl">
        <NewProposalForm
          clients={clientList.map((c) => ({ value: c.id, label: c.name }))}
          deals={openDeals.map((d) => ({ value: d.id, label: d.title, clientId: d.client!.id }))}
          defaults={{ client_id: fromDeal?.client?.id ?? "", opportunity_id: fromDeal?.id ?? "", title: fromDeal?.title ?? "" }}
        />
      </Card>
    </>
  );
}

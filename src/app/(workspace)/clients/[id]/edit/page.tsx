import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { updateClientAction } from "@/features/clients/actions";
import { ClientForm } from "@/features/clients/client-form";
import { getClientDetail } from "@/features/clients/queries";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: PageProps<"/clients/[id]/edit">) {
  const ws = await requirePermission("clients:write");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [client, roster] = await Promise.all([getClientDetail(ws.organization.id, id), getRoster(ws.organization.id)]);
  if (!client) notFound();
  return (
    <>
      <PageHeader back={{ href: `/clients/${id}`, label: client.name }} title="Edit client" />
      <Card className="max-w-3xl">
        <ClientForm
          action={updateClientAction.bind(null, id)}
          defaults={client}
          owners={roster.map((m) => ({ value: m.user_id, label: memberLabel(m) }))}
          cancelHref={`/clients/${id}`}
          submitLabel="Save changes"
        />
      </Card>
    </>
  );
}

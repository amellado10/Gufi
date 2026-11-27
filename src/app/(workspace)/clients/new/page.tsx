import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { createClientAction } from "@/features/clients/actions";
import { ClientForm } from "@/features/clients/client-form";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const ws = await requirePermission("clients:write");
  const roster = await getRoster(ws.organization.id);
  return (
    <>
      <PageHeader back={{ href: "/clients", label: "Clients" }} title="New client" />
      <Card className="max-w-3xl">
        <ClientForm
          action={createClientAction}
          defaults={{ owner_id: ws.user.id }}
          owners={roster.map((m) => ({ value: m.user_id, label: memberLabel(m) }))}
          cancelHref="/clients"
          submitLabel="Create client"
          withContact
        />
      </Card>
    </>
  );
}

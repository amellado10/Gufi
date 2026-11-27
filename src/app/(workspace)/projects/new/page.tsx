import type { Metadata } from "next";
import { Building } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { createProjectAction } from "@/features/projects/actions";
import { ProjectForm } from "@/features/projects/project-form";
import { clientOptions } from "@/features/clients/queries";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  const ws = await requirePermission("projects:write");
  const { client } = await searchParams;
  const [clients, roster] = await Promise.all([clientOptions(ws.organization.id), getRoster(ws.organization.id)]);
  const preselected = typeof client === "string" && clients.some((c) => c.id === client) ? client : "";

  return (
    <>
      <PageHeader back={{ href: "/projects", label: "Projects" }} title="New project" />
      <Card className="max-w-3xl">
        {clients.length === 0 ? (
          <EmptyState icon={Building} title="Add a client first" action={<ButtonLink href="/clients/new">New client</ButtonLink>}>
            Every project belongs to a client.
          </EmptyState>
        ) : (
          <ProjectForm
            action={createProjectAction}
            defaults={{ client_id: preselected, owner_id: ws.user.id }}
            clients={clients.map((c) => ({ value: c.id, label: c.name }))}
            owners={roster.map((m) => ({ value: m.user_id, label: memberLabel(m) }))}
            cancelHref={preselected ? `/clients/${preselected}` : "/projects"}
            submitLabel="Create project"
          />
        )}
      </Card>
    </>
  );
}

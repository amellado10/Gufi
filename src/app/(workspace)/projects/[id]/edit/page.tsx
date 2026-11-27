import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { updateProjectAction } from "@/features/projects/actions";
import { ProjectForm } from "@/features/projects/project-form";
import { getProjectDetail } from "@/features/projects/queries";
import { clientOptions } from "@/features/clients/queries";
import { getRoster, memberLabel } from "@/features/workspace/roster";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  const ws = await requirePermission("projects:write");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [project, clients, roster] = await Promise.all([getProjectDetail(ws.organization.id, id), clientOptions(ws.organization.id), getRoster(ws.organization.id)]);
  if (!project) notFound();
  const clientList = clients.some((c) => c.id === project.client_id) || !project.client ? clients : [...clients, project.client];

  return (
    <>
      <PageHeader back={{ href: `/projects/${id}`, label: project.name }} title="Edit project" />
      <Card className="max-w-3xl">
        <ProjectForm
          action={updateProjectAction.bind(null, id)}
          defaults={project}
          clients={clientList.map((c) => ({ value: c.id, label: c.name }))}
          owners={roster.map((m) => ({ value: m.user_id, label: memberLabel(m) }))}
          cancelHref={`/projects/${id}`}
          submitLabel="Save changes"
        />
      </Card>
    </>
  );
}

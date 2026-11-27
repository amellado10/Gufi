"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/ui/form";
import { projectInput } from "./schema";
import { PROJECT_STATUSES, type ProjectStatus } from "./status";

const values = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
const NO_PERMISSION: FormState = { message: "Only admins and project managers can change projects." };

export async function createProjectAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "projects:write")) return NO_PERMISSION;

  const parsed = projectInput.safeParse(values(form));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: values(form) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, status: parsed.data.status as ProjectStatus, organization_id: ws.organization.id, created_by: ws.user.id })
    .select("id")
    .single();
  if (error) return { message: friendlyDbError(error, "project"), values: values(form) };

  // The owner is on the team by default.
  if (parsed.data.owner_id) {
    await supabase.from("project_members").insert({ organization_id: ws.organization.id, project_id: data.id, user_id: parsed.data.owner_id });
  }
  revalidatePath("/projects");
  revalidatePath(`/clients/${parsed.data.client_id}`);
  redirect(`/projects/${data.id}`);
}

export async function updateProjectAction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "projects:write")) return NO_PERMISSION;

  const parsed = projectInput.safeParse(values(form));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: values(form) };
  const status = parsed.data.status as ProjectStatus;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .update({ ...parsed.data, status })
    .eq("organization_id", ws.organization.id)
    .eq("id", id)
    .select("id");
  if (error) return { message: friendlyDbError(error, "project"), values: values(form) };
  if (!data?.length) return { message: "That project doesn't exist or you can't edit it." };

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  redirect(`/projects/${id}`);
}

export async function setProjectStatusAction(id: string, status: string) {
  const ws = await requireWorkspace();
  if (!can(ws.role, "projects:write") || !PROJECT_STATUSES.includes(status as ProjectStatus)) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: status as ProjectStatus })
    .eq("organization_id", ws.organization.id)
    .eq("id", id);
  if (error) throw new Error(friendlyDbError(error, "project"));
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function assignMemberAction(projectId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "projects:assign")) return { message: "Only admins and project managers can assign people." };
  const userId = z.uuid().safeParse(form.get("user_id"));
  if (!userId.success) return { errors: { user_id: ["Choose a teammate."] } };

  const supabase = await createClient();
  const { error } = await supabase.from("project_members").insert({ organization_id: ws.organization.id, project_id: projectId, user_id: userId.data });
  if (error) return { message: error.code === "23505" ? "They're already on this project." : friendlyDbError(error, "assignment") };
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, message: "Added to the project." };
}

export async function removeMemberAction(projectId: string, userId: string) {
  const ws = await requireWorkspace();
  if (!can(ws.role, "projects:assign")) return;
  const supabase = await createClient();
  const { error } = await supabase.from("project_members").delete().eq("organization_id", ws.organization.id).eq("project_id", projectId).eq("user_id", userId);
  if (error) throw new Error(friendlyDbError(error, "assignment"));
  revalidatePath(`/projects/${projectId}`);
}

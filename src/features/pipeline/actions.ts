"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/ui/form";
import { dealInput, type DealInput } from "./model";

const values = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
const NO_PERMISSION: FormState = { message: "Your role can't change deals. Ask an admin, project manager or marketing." };

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Use the chosen client, or create the company as a prospect (reusing it if the name exists).
async function resolveClient(supabase: Supabase, organizationId: string, userId: string, d: DealInput): Promise<{ id: string } | { error: string }> {
  if (d.client_id) return { id: d.client_id };
  const name = d.new_client_name!.trim();
  const { data: existing } = await supabase.from("clients").select("id").eq("organization_id", organizationId).ilike("name", name.replace(/[%_\\]/g, (c) => `\\${c}`)).maybeSingle();
  if (existing) return { id: existing.id };
  const { data, error } = await supabase
    .from("clients")
    .insert({ organization_id: organizationId, name, status: "prospect", created_by: userId })
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error, "client") };
  return { id: data.id };
}

function dealFields(d: DealInput) {
  return {
    title: d.title,
    stage_id: d.stage_id,
    value_cents: d.value_cents,
    owner_id: d.owner_id,
    contact_id: d.contact_id,
    source: d.source,
    source_detail: d.source_detail,
    brought_by_partner_id: d.brought_by_partner_id,
    expected_close_on: d.expected_close_on,
    next_follow_up_on: d.next_follow_up_on,
    lost_reason: d.lost_reason,
    notes: d.notes,
  };
}

function dealError(error: { code?: string; message?: string }) {
  if (error.message?.includes("needs a reason")) return { errors: { lost_reason: ["Say why the deal was lost."] } };
  if (error.code === "23503" && error.message?.includes("contact")) return { errors: { contact_id: ["That contact belongs to a different client."] } };
  return { message: friendlyDbError(error, "deal") };
}

export async function createDealAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) return NO_PERMISSION;
  const parsed = dealInput.safeParse(values(form));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: values(form) };

  const supabase = await createClient();
  const client = await resolveClient(supabase, ws.organization.id, ws.user.id, parsed.data);
  if ("error" in client) return { message: client.error, values: values(form) };
  const { data, error } = await supabase
    .from("opportunities")
    .insert({ ...dealFields(parsed.data), client_id: client.id, organization_id: ws.organization.id, created_by: ws.user.id })
    .select("id")
    .single();
  if (error) return { ...dealError(error), values: values(form) };
  revalidatePath("/pipeline");
  redirect(`/pipeline/${data.id}`);
}

export async function updateDealAction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) return NO_PERMISSION;
  const parsed = dealInput.safeParse(values(form));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: values(form) };

  const supabase = await createClient();
  const client = await resolveClient(supabase, ws.organization.id, ws.user.id, parsed.data);
  if ("error" in client) return { message: client.error, values: values(form) };
  const { data, error } = await supabase
    .from("opportunities")
    .update({ ...dealFields(parsed.data), client_id: client.id })
    .eq("organization_id", ws.organization.id)
    .eq("id", id)
    .select("id");
  if (error) return { ...dealError(error), values: values(form) };
  if (!data?.length) return { message: "That deal doesn't exist or you can't edit it." };
  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${id}`);
  redirect(`/pipeline/${id}`);
}

// Used by the board (drag and drop) and the stage buttons. Returns a result instead of
// redirecting so the board can roll back an optimistic move.
export async function moveDealAction(id: string, stageId: string, lostReason?: string): Promise<{ ok: true } | { ok: false; message: string; needsReason?: boolean }> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) return { ok: false, message: "Your role can't move deals." };
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(stageId).success) return { ok: false, message: "Unknown deal or stage." };
  const reason = lostReason?.trim().slice(0, 1000) || undefined;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ stage_id: stageId, ...(reason ? { lost_reason: reason } : {}) })
    .eq("organization_id", ws.organization.id)
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.message?.includes("needs a reason")) return { ok: false, message: "Say why the deal was lost.", needsReason: true };
    return { ok: false, message: friendlyDbError(error, "deal") };
  }
  if (!data?.length) return { ok: false, message: "That deal doesn't exist or you can't move it." };
  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${id}`);
  revalidatePath("/");
  return { ok: true };
}

export async function addActivityAction(dealId: string, clientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) return NO_PERMISSION;
  const parsed = z
    .object({ kind: z.enum(["note", "call", "email", "meeting"]), body: z.string().trim().min(1, "Write something first.").max(5000) })
    .safeParse(values(form));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: values(form) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("activities")
    .insert({ organization_id: ws.organization.id, client_id: clientId, opportunity_id: dealId, kind: parsed.data.kind, body: parsed.data.body, created_by: ws.user.id });
  if (error) return { message: friendlyDbError(error, "note"), values: values(form) };
  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: "Added to the timeline." };
}

export async function deleteActivityAction(activityId: string, dealId: string) {
  const ws = await requireWorkspace();
  const supabase = await createClient();
  const { error } = await supabase.from("activities").delete().eq("organization_id", ws.organization.id).eq("id", activityId);
  if (error) throw new Error(friendlyDbError(error, "note"));
  revalidatePath(`/pipeline/${dealId}`);
}

// Won deal → project (once). The client becomes active.
export async function createProjectFromDealAction(dealId: string) {
  const ws = await requireWorkspace();
  if (!can(ws.role, "projects:write")) redirect("/no-access?reason=permission");
  const supabase = await createClient();
  const { data: deal } = await supabase
    .from("opportunities")
    .select("id, title, client_id, owner_id, won_project_id, notes, stage:pipeline_stages(kind)")
    .eq("organization_id", ws.organization.id)
    .eq("id", dealId)
    .maybeSingle();
  if (!deal) redirect("/pipeline");
  if (deal.won_project_id) redirect(`/projects/${deal.won_project_id}`);
  if ((deal.stage as unknown as { kind: string } | null)?.kind !== "won") redirect(`/pipeline/${dealId}`);

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      organization_id: ws.organization.id,
      client_id: deal.client_id,
      name: deal.title,
      status: "planning",
      owner_id: deal.owner_id,
      description: deal.notes,
      created_by: ws.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(friendlyDbError(error, "project"));
  await supabase.from("opportunities").update({ won_project_id: project.id }).eq("id", dealId);
  await supabase.from("clients").update({ status: "active" }).eq("id", deal.client_id).eq("status", "prospect");
  if (deal.owner_id) await supabase.from("project_members").insert({ organization_id: ws.organization.id, project_id: project.id, user_id: deal.owner_id });
  revalidatePath("/pipeline");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

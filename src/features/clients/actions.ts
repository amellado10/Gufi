"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/components/ui/form";
import { clientInput, contactFromClientForm, contactInput, normalizeWebsite } from "./schema";

const values = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
const NO_PERMISSION: FormState = { message: "Your role can't change clients. Ask an admin or project manager." };

function duplicateMessage(error: { code?: string; message?: string }) {
  if (error.code !== "23505") return null;
  return error.message?.includes("domain") ? "A client with this website already exists." : "A client with this name already exists.";
}

export async function createClientAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "clients:write")) return NO_PERMISSION;

  const parsed = clientInput.safeParse(values(form));
  const contact = contactFromClientForm(values(form));
  if (!parsed.success || contact.errors) {
    return { errors: { ...(parsed.success ? {} : z.flattenError(parsed.error).fieldErrors), ...(contact.errors ?? {}) }, values: values(form) };
  }
  if (contact.contact && !contact.contact.full_name) return { errors: { contact_name: ["Add the contact's name."] }, values: values(form) };
  const site = normalizeWebsite(parsed.data.website);
  if ("error" in site) return { errors: { website: [site.error] }, values: values(form) };

  const supabase = await createClient();
  if (contact.contact?.email) {
    const { data: taken } = await supabase.from("contacts").select("id").eq("organization_id", ws.organization.id).ilike("email", contact.contact.email).maybeSingle();
    if (taken) return { errors: { contact_email: ["Someone with this email is already a contact."] }, values: values(form) };
  }
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...parsed.data, ...site, status: parsed.data.status as never, organization_id: ws.organization.id, created_by: ws.user.id })
    .select("id")
    .single();
  if (error) return { message: duplicateMessage(error) ?? friendlyDbError(error, "client"), values: values(form) };
  if (contact.contact) {
    await supabase
      .from("contacts")
      .insert({ ...contact.contact, is_primary: true, client_id: data.id, organization_id: ws.organization.id, created_by: ws.user.id });
  }

  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

export async function updateClientAction(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "clients:write")) return NO_PERMISSION;

  const parsed = clientInput.safeParse(values(form));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: values(form) };
  const site = normalizeWebsite(parsed.data.website);
  if ("error" in site) return { errors: { website: [site.error] }, values: values(form) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ ...parsed.data, ...site, status: parsed.data.status as never })
    .eq("organization_id", ws.organization.id)
    .eq("id", id)
    .select("id");
  if (error) return { message: duplicateMessage(error) ?? friendlyDbError(error, "client"), values: values(form) };
  if (!data?.length) return { message: "That client doesn't exist or you can't edit it." };

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function addContactAction(clientId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "contacts:write")) return { message: "Your role can't add contacts." };

  const parsed = contactInput.safeParse(values(form));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: values(form) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .insert({ ...parsed.data, client_id: clientId, organization_id: ws.organization.id, created_by: ws.user.id });
  if (error) {
    const message = error.code === "23505" ? "Someone with this email is already a contact." : friendlyDbError(error, "contact");
    return { message, values: values(form) };
  }
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: `${parsed.data.full_name} was added.` };
}

export async function updateContactAction(clientId: string, contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "contacts:write")) return { message: "Your role can't edit contacts." };
  const parsed = contactInput.safeParse(values(form));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: values(form) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .update({ ...parsed.data, notes: null })
    .eq("organization_id", ws.organization.id)
    .eq("client_id", clientId)
    .eq("id", contactId)
    .select("id");
  if (error) {
    const message = error.code === "23505" ? "Someone with this email is already a contact." : friendlyDbError(error, "contact");
    return { message, values: values(form) };
  }
  if (!data?.length) return { message: "That contact doesn't exist or you can't edit it." };
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

export async function deleteContactAction(clientId: string, contactId: string) {
  const ws = await requireWorkspace();
  if (!can(ws.role, "contacts:write")) redirect("/no-access?reason=permission");
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("organization_id", ws.organization.id).eq("client_id", clientId).eq("id", contactId);
  if (error) throw new Error(friendlyDbError(error, "contact"));
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}

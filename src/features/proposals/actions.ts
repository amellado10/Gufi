"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { todayIn } from "@/lib/format";
import { can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { parseMoneyToCents } from "@/features/pipeline/model";
import type { FormState } from "@/components/ui/form";
import { DEFAULT_MILESTONES, editorPayload, parsePercent, parseQuantity, readyToSend } from "./model";

const NO_PERMISSION = "Your role can't change proposals. Ask an admin, project manager or marketing.";

// ── Create ──────────────────────────────────────────────────────────────────

export async function createProposalAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) return { message: NO_PERMISSION };
  const raw = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = z
    .object({
      title: z.string().trim().min(1, "Give the proposal a title.").max(200),
      client_id: z.uuid("Choose a client."),
      opportunity_id: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
      language: z.enum(["es", "en"]),
    })
    .safeParse(raw);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: raw };
  const d = parsed.data;

  const supabase = await createClient();
  if (d.opportunity_id) {
    const { data: deal } = await supabase.from("opportunities").select("client_id").eq("id", d.opportunity_id).maybeSingle();
    if (!deal || deal.client_id !== d.client_id) return { errors: { opportunity_id: ["That deal belongs to a different client."] }, values: raw };
  }
  const { data: proposal, error } = await supabase
    .from("proposals")
    .insert({ organization_id: ws.organization.id, client_id: d.client_id, opportunity_id: d.opportunity_id, title: d.title, language: d.language, created_by: ws.user.id })
    .select("id")
    .single();
  if (error) return { message: friendlyDbError(error, "proposal"), values: raw };
  const validUntil = new Date(Date.parse(`${todayIn(ws.organization.timezone)}T12:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: version, error: vErr } = await supabase
    .from("proposal_versions")
    .insert({ organization_id: ws.organization.id, proposal_id: proposal.id, version: 1, valid_until: validUntil, created_by: ws.user.id })
    .select("id")
    .single();
  if (vErr) return { message: friendlyDbError(vErr, "proposal") };
  await supabase.from("proposal_payment_milestones").insert(
    DEFAULT_MILESTONES[d.language].map((m, i) => ({ ...m, organization_id: ws.organization.id, version_id: version.id, position: i + 1 })),
  );
  revalidatePath("/proposals");
  redirect(`/proposals/${proposal.id}`);
}

// ── Save a draft ────────────────────────────────────────────────────────────

export type SaveResult = { ok: true; savedAt: string } | { ok: false; message: string; issues?: { path: (string | number)[]; message: string }[] };

export async function saveDraftAction(proposalId: string, versionId: string, payloadJson: string): Promise<SaveResult> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) return { ok: false, message: NO_PERMISSION };
  let json: unknown;
  try {
    json = JSON.parse(payloadJson);
  } catch {
    return { ok: false, message: "Couldn't read the proposal. Reload and try again." };
  }
  const parsed = editorPayload.safeParse(json);
  if (!parsed.success) {
    return { ok: false, message: "Some fields need attention.", issues: parsed.error.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message })) };
  }
  const p = parsed.data;
  const supabase = await createClient();
  const org = ws.organization.id;

  const { data: version } = await supabase.from("proposal_versions").select("id, locked_at, proposal_id").eq("organization_id", org).eq("id", versionId).maybeSingle();
  if (!version || version.proposal_id !== proposalId) return { ok: false, message: "That proposal doesn't exist." };
  if (version.locked_at) return { ok: false, message: "This version was already sent and can't change. Create a new revision." };

  const steps = [
    supabase.from("proposals").update({ title: p.title, language: p.language }).eq("organization_id", org).eq("id", proposalId),
    supabase
      .from("proposal_versions")
      .update({ content: { sections: p.sections.filter((s) => s.body) }, tax_rate_bps: p.tax_rate_bps, valid_until: p.valid_until })
      .eq("organization_id", org)
      .eq("id", versionId),
    supabase.from("proposal_items").delete().eq("organization_id", org).eq("version_id", versionId),
    supabase.from("proposal_payment_milestones").delete().eq("organization_id", org).eq("version_id", versionId),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) return { ok: false, message: friendlyDbError(error, "proposal") };
  }
  if (p.items.length) {
    const { error } = await supabase.from("proposal_items").insert(
      p.items.map((it, i) => ({
        organization_id: org,
        version_id: versionId,
        position: i + 1,
        name: it.name,
        description: it.description || null,
        quantity_hundredths: parseQuantity(it.quantity) as number,
        unit_price_cents: parseMoneyToCents(it.unit_price) as number,
        optional: it.optional,
      })),
    );
    if (error) return { ok: false, message: friendlyDbError(error, "line item") };
  }
  if (p.milestones.length) {
    const { error } = await supabase.from("proposal_payment_milestones").insert(
      p.milestones.map((m, i) => ({ organization_id: org, version_id: versionId, position: i + 1, label: m.label, percent_bps: parsePercent(m.percent) as number, due: m.due || null })),
    );
    if (error) return { ok: false, message: friendlyDbError(error, "payment") };
  }
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true, savedAt: new Date().toISOString() };
}

// ── Send ────────────────────────────────────────────────────────────────────

export async function sendProposalAction(proposalId: string, versionId: string): Promise<{ ok: false; problems: string[] } | void> {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) return { ok: false, problems: [NO_PERMISSION] };
  const supabase = await createClient();
  const org = ws.organization.id;

  const [{ data: version }, { data: items }, { data: milestones }, { data: proposal }] = await Promise.all([
    supabase.from("proposal_versions").select("id, proposal_id, locked_at, valid_until").eq("organization_id", org).eq("id", versionId).maybeSingle(),
    supabase.from("proposal_items").select("optional").eq("version_id", versionId),
    supabase.from("proposal_payment_milestones").select("percent_bps").eq("version_id", versionId),
    supabase.from("proposals").select("id, opportunity_id").eq("organization_id", org).eq("id", proposalId).maybeSingle(),
  ]);
  if (!version || !proposal || version.proposal_id !== proposalId) return { ok: false, problems: ["That proposal doesn't exist."] };
  if (version.locked_at) redirect(`/proposals/${proposalId}`);
  const problems = readyToSend({ items: items ?? [], milestones: milestones ?? [], valid_until: version.valid_until }, todayIn(ws.organization.timezone));
  if (problems.length) return { ok: false, problems };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("proposal_versions")
    .update({ locked_at: now, sent_at: now, sent_by: ws.user.id, status: "sent" })
    .eq("organization_id", org)
    .eq("id", versionId);
  if (error) return { ok: false, problems: [friendlyDbError(error, "proposal")] };

  // Earlier versions that were out with the client are replaced, and their links stop working.
  const { data: older } = await supabase
    .from("proposal_versions")
    .select("id")
    .eq("proposal_id", proposalId)
    .neq("id", versionId)
    .in("status", ["sent", "viewed"]);
  const olderIds = (older ?? []).map((v) => v.id);
  if (olderIds.length) {
    await supabase.from("proposal_versions").update({ status: "superseded" }).in("id", olderIds);
    await supabase.from("proposal_share_links").update({ revoked_at: now }).in("version_id", olderIds).is("revoked_at", null);
  }
  await supabase.from("proposals").update({ status: "sent" }).eq("id", proposalId);
  await supabase.from("proposal_share_links").insert({ organization_id: org, version_id: versionId, token: randomBytes(32).toString("base64url"), created_by: ws.user.id });

  // The deal moves to "Proposal sent" if it was at an earlier open stage.
  if (proposal.opportunity_id) {
    const [{ data: deal }, { data: stages }] = await Promise.all([
      supabase.from("opportunities").select("stage_id").eq("id", proposal.opportunity_id).maybeSingle(),
      supabase.from("pipeline_stages").select("id, key, kind, position").eq("organization_id", org),
    ]);
    const target = stages?.find((s) => s.key === "proposal_sent");
    const current = stages?.find((s) => s.id === deal?.stage_id);
    if (target && current && current.kind === "open" && current.position < target.position) {
      await supabase.from("opportunities").update({ stage_id: target.id }).eq("id", proposal.opportunity_id);
    }
  }
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  revalidatePath("/pipeline");
  redirect(`/proposals/${proposalId}`);
}

// ── Revise ──────────────────────────────────────────────────────────────────

export async function newRevisionAction(proposalId: string) {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) redirect("/no-access?reason=permission");
  const supabase = await createClient();
  const org = ws.organization.id;
  const { data: latest } = await supabase
    .from("proposal_versions")
    .select("*")
    .eq("organization_id", org)
    .eq("proposal_id", proposalId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) redirect("/proposals");
  if (!latest.locked_at || latest.status === "accepted") redirect(`/proposals/${proposalId}`);

  const { data: created, error } = await supabase
    .from("proposal_versions")
    .insert({
      organization_id: org,
      proposal_id: proposalId,
      version: latest.version + 1,
      content: latest.content,
      currency: latest.currency,
      tax_rate_bps: latest.tax_rate_bps,
      valid_until: latest.valid_until,
      created_by: ws.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(friendlyDbError(error, "revision"));
  const [{ data: items }, { data: milestones }] = await Promise.all([
    supabase.from("proposal_items").select("*").eq("version_id", latest.id).order("position"),
    supabase.from("proposal_payment_milestones").select("*").eq("version_id", latest.id).order("position"),
  ]);
  if (items?.length) {
    await supabase.from("proposal_items").insert(
      items.map((i) => ({
        organization_id: org,
        version_id: created.id,
        position: i.position,
        name: i.name,
        description: i.description,
        quantity_hundredths: i.quantity_hundredths,
        unit_price_cents: i.unit_price_cents,
        optional: i.optional,
      })),
    );
  }
  if (milestones?.length) {
    await supabase
      .from("proposal_payment_milestones")
      .insert(milestones.map((m) => ({ organization_id: org, version_id: created.id, position: m.position, label: m.label, percent_bps: m.percent_bps, due: m.due })));
  }
  await supabase.from("proposals").update({ status: "draft" }).eq("id", proposalId);
  revalidatePath(`/proposals/${proposalId}`);
  redirect(`/proposals/${proposalId}`);
}

export async function revokeLinkAction(proposalId: string, linkId: string) {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) return;
  const supabase = await createClient();
  await supabase.from("proposal_share_links").update({ revoked_at: new Date().toISOString() }).eq("organization_id", ws.organization.id).eq("id", linkId);
  revalidatePath(`/proposals/${proposalId}`);
}

// ── Client response (public link, no login) ─────────────────────────────────

export async function respondToProposalAction(
  token: string,
  input: { decision: "accepted" | "declined"; name: string; email: string; title: string; reason: string; selected: string[]; agreed: boolean },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = z
    .object({
      decision: z.enum(["accepted", "declined"]),
      name: z.string().trim().min(2).max(160),
      email: z.email(),
      title: z.string().trim().max(120),
      reason: z.string().trim().max(2000),
      selected: z.array(z.uuid()).max(100),
      agreed: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Please fill in your name and a valid email." };
  if (parsed.data.decision === "accepted" && !parsed.data.agreed) return { ok: false, message: "Please confirm the acceptance checkbox." };
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return { ok: false, message: "This link is invalid." };

  const h = await headers();
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_shared_proposal", {
    p_token: token,
    p_decision: parsed.data.decision,
    p_signer_name: parsed.data.name,
    p_signer_email: parsed.data.email,
    p_signer_title: parsed.data.title || null,
    p_decline_reason: parsed.data.reason || null,
    p_selected_optional: parsed.data.selected,
    p_user_agent: h.get("user-agent")?.slice(0, 500) ?? null,
    p_ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || null,
  });
  if (error) {
    const known = ["expired", "invalid", "can no longer be answered"].some((k) => error.message.includes(k));
    return { ok: false, message: known ? error.message : "Something went wrong. Please try again or contact us." };
  }
  revalidatePath(`/p/${token}`);
  return { ok: true };
}

// A fresh client link for a sent version (e.g. after revoking the old one).
export async function createLinkAction(proposalId: string, versionId: string) {
  const ws = await requireWorkspace();
  if (!can(ws.role, "pipeline:write")) return;
  const supabase = await createClient();
  const { data: version } = await supabase.from("proposal_versions").select("id, status, proposal_id").eq("organization_id", ws.organization.id).eq("id", versionId).maybeSingle();
  if (!version || version.proposal_id !== proposalId || !["sent", "viewed"].includes(version.status)) return;
  await supabase.from("proposal_share_links").insert({ organization_id: ws.organization.id, version_id: versionId, token: randomBytes(32).toString("base64url"), created_by: ws.user.id });
  revalidatePath(`/proposals/${proposalId}`);
}

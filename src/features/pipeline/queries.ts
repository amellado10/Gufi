import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type Stage = Pick<Tables<"pipeline_stages">, "id" | "key" | "name" | "kind" | "position" | "probability_bps">;

export const listStages = cache(async (organizationId: string): Promise<Stage[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id, key, name, kind, position, probability_bps")
    .eq("organization_id", organizationId)
    .order("position");
  if (error) throw new Error(`Could not load pipeline stages: ${error.message}`);
  return data ?? [];
});

export type DealRow = {
  id: string;
  title: string;
  stage_id: string;
  value_cents: number | null;
  currency: string;
  owner_id: string | null;
  source: Tables<"opportunities">["source"];
  expected_close_on: string | null;
  next_follow_up_on: string | null;
  closed_on: string | null;
  won_project_id: string | null;
  updated_at: string;
  client: { id: string; name: string; status: string } | null;
};

const DEAL_COLUMNS =
  "id, title, stage_id, value_cents, currency, owner_id, source, expected_close_on, next_follow_up_on, closed_on, won_project_id, updated_at, client:clients(id, name, status)";

export async function listDeals(organizationId: string, opts: { ownerId?: string; clientId?: string } = {}): Promise<DealRow[]> {
  const supabase = await createClient();
  let q = supabase.from("opportunities").select(DEAL_COLUMNS).eq("organization_id", organizationId);
  if (opts.ownerId) q = q.eq("owner_id", opts.ownerId);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q.order("next_follow_up_on", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false }).limit(1000);
  if (error) throw new Error(`Could not load deals: ${error.message}`);
  return (data ?? []) as unknown as DealRow[];
}

export async function getDeal(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*, client:clients(id, name, status), contact:contacts(id, full_name, email, phone)")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the deal: ${error.message}`);
  return data as
    | (Tables<"opportunities"> & {
        client: { id: string; name: string; status: string } | null;
        contact: { id: string; full_name: string; email: string | null; phone: string | null } | null;
      })
    | null;
}

export async function listActivities(organizationId: string, opts: { opportunityId?: string; clientId?: string }) {
  const supabase = await createClient();
  let q = supabase.from("activities").select("id, kind, body, occurred_at, created_by, opportunity_id").eq("organization_id", organizationId);
  if (opts.opportunityId) q = q.eq("opportunity_id", opts.opportunityId);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q.order("occurred_at", { ascending: false }).limit(200);
  if (error) throw new Error(`Could not load activity: ${error.message}`);
  return data ?? [];
}

// Partners for "who brought the client" (names are readable by sales roles; pay stays admins-only).
export async function listPartnerOptions(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("partners").select("id, full_name").eq("organization_id", organizationId).order("full_name");
  return (data ?? []).map((p) => ({ value: p.id, label: p.full_name }));
}

export async function listContactOptions(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("id, full_name, client_id").eq("organization_id", organizationId).order("full_name");
  return data ?? [];
}

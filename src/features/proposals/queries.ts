import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { publicProposal, SECTION_KEYS, totals, type PublicProposal, type SectionKey } from "./model";

type VersionWithItems = Pick<Tables<"proposal_versions">, "id" | "version" | "status" | "tax_rate_bps" | "valid_until" | "sent_at" | "updated_at"> & {
  proposal_items: Pick<Tables<"proposal_items">, "unit_price_cents" | "quantity_hundredths" | "optional">[];
};

export async function listProposals(organizationId: string, opts: { opportunityId?: string; clientId?: string } = {}) {
  const supabase = await createClient();
  let q = supabase
    .from("proposals")
    .select(
      "id, number, title, status, language, opportunity_id, project_id, updated_at, client:clients(id, name), proposal_versions(id, version, status, tax_rate_bps, valid_until, sent_at, updated_at, proposal_items(unit_price_cents, quantity_hundredths, optional))",
    )
    .eq("organization_id", organizationId);
  if (opts.opportunityId) q = q.eq("opportunity_id", opts.opportunityId);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q.order("number", { ascending: false }).limit(500);
  if (error) throw new Error(`Could not load proposals: ${error.message}`);
  return ((data ?? []) as unknown as (Pick<Tables<"proposals">, "id" | "number" | "title" | "status" | "language" | "opportunity_id" | "project_id" | "updated_at"> & {
    client: { id: string; name: string } | null;
    proposal_versions: VersionWithItems[];
  })[]).map((p) => {
    const latest = [...p.proposal_versions].sort((a, b) => b.version - a.version)[0];
    return { ...p, latest, totals: latest ? totals(latest.proposal_items, latest.tax_rate_bps) : null };
  });
}

export async function getProposal(organizationId: string, id: string) {
  const supabase = await createClient();
  const { data: proposal, error } = await supabase
    .from("proposals")
    .select("*, client:clients(id, name, status), opportunity:opportunities(id, title)")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the proposal: ${error.message}`);
  if (!proposal) return null;

  const { data: versions } = await supabase
    .from("proposal_versions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("proposal_id", id)
    .order("version", { ascending: false });
  const latest = versions?.[0];
  if (!latest) return null;

  const versionIds = (versions ?? []).map((v) => v.id);
  const [{ data: items }, { data: milestones }, { data: links }, { data: responses }] = await Promise.all([
    supabase.from("proposal_items").select("*").eq("version_id", latest.id).order("position"),
    supabase.from("proposal_payment_milestones").select("*").eq("version_id", latest.id).order("position"),
    supabase.from("proposal_share_links").select("id, version_id, token, revoked_at, expires_at, created_at").in("version_id", versionIds),
    supabase.from("proposal_responses").select("*").in("version_id", versionIds),
  ]);
  return {
    proposal: proposal as Tables<"proposals"> & { client: { id: string; name: string; status: string } | null; opportunity: { id: string; title: string } | null },
    versions: versions ?? [],
    latest,
    items: items ?? [],
    milestones: milestones ?? [],
    links: links ?? [],
    responses: responses ?? [],
  };
}

export type ProposalBundle = NonNullable<Awaited<ReturnType<typeof getProposal>>>;

export function sectionsOf(content: unknown): { key: SectionKey; body: string }[] {
  const raw = (content as { sections?: { key?: string; body?: string }[] } | null)?.sections ?? [];
  return SECTION_KEYS.map((key) => ({ key, body: raw.find((s) => s.key === key)?.body ?? "" }));
}

// Internal preview: the same shape the client link returns, built from the latest version.
export function toDocument(b: ProposalBundle, organizationName: string): PublicProposal {
  const response = b.responses.find((r) => r.version_id === b.latest.id);
  return publicProposal.parse({
    number: b.proposal.number,
    title: b.proposal.title,
    language: b.proposal.language,
    client_name: b.proposal.client?.name ?? "",
    organization_name: organizationName,
    version: b.latest.version,
    status: b.latest.status,
    currency: b.latest.currency,
    tax_rate_bps: b.latest.tax_rate_bps,
    valid_until: b.latest.valid_until,
    sent_at: b.latest.sent_at,
    content: { sections: sectionsOf(b.latest.content).filter((s) => s.body) },
    items: b.items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      quantity_hundredths: i.quantity_hundredths,
      unit_price_cents: Number(i.unit_price_cents),
      line_total_cents: Number(i.line_total_cents),
      optional: i.optional,
    })),
    milestones: b.milestones.map((m) => ({ label: m.label, percent_bps: m.percent_bps, due: m.due })),
    response: response
      ? {
          decision: response.decision,
          signer_name: response.signer_name,
          responded_at: response.responded_at,
          selected_optional_item_ids: response.selected_optional_item_ids,
          subtotal_cents: response.subtotal_cents,
          tax_cents: response.tax_cents,
          total_cents: response.total_cents,
        }
      : null,
  });
}

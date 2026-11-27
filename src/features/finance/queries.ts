import "server-only";
import { createClient } from "@/lib/supabase/server";
import { companySnapshotData, partnerSnapshotData } from "./snapshot";
import { partnerAmounts, splitPools } from "./split";

// Reads go through the user's session: RLS decides who gets finance data at all.

export async function getCompanySnapshot(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_snapshots")
    .select("key, title, basis, period_start, period_end, reconciled_through, currency, source, data, updated_at")
    .eq("organization_id", organizationId)
    .eq("audience", "finance")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the financial snapshot: ${error.message}`);
  if (!data) return null;
  const parsed = companySnapshotData.safeParse(data.data);
  if (!parsed.success) throw new Error(`Financial snapshot "${data.key}" is malformed`);
  return { ...data, data: parsed.data };
}

export async function getPartnerSnapshot(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_snapshots")
    .select("key, title, period_end, source, data")
    .eq("organization_id", organizationId)
    .eq("audience", "admins")
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load the partner snapshot: ${error.message}`);
  if (!data) return null;
  const parsed = partnerSnapshotData.safeParse(data.data);
  return parsed.success ? { ...data, data: parsed.data } : null;
}

export type ProjectFinanceRow = {
  project_id: string;
  currency: string;
  contract_cents: number;
  tax_rate_bps: number | null;
  tax_cents: number | null;
  collected_cents: number | null;
  outstanding_cents: number;
  invoice_ref: string | null;
  payment_due_date: string | null;
  origination_bps: number;
  delivery_bps: number;
  as_of: string;
  source: string;
  notes: string | null;
};

const FINANCE_COLUMNS =
  "project_id, currency, contract_cents, tax_rate_bps, tax_cents, collected_cents, outstanding_cents, invoice_ref, payment_due_date, origination_bps, delivery_bps, as_of, source, notes";

export async function listProjectFinances(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_finances")
    .select(`${FINANCE_COLUMNS}, project:projects(id, name, status, client:clients(id, name))`)
    .eq("organization_id", organizationId)
    .order("outstanding_cents", { ascending: false });
  if (error) throw new Error(`Could not load project finances: ${error.message}`);
  return (data ?? []) as unknown as (ProjectFinanceRow & {
    project: { id: string; name: string; status: string; client: { id: string; name: string } | null } | null;
  })[];
}

export async function getProjectFinance(organizationId: string, projectId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_finances")
    .select(FINANCE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the project's finances: ${error.message}`);
  return data as ProjectFinanceRow | null;
}

// The split on one project: each person's share, plus Güfi's remainder.
export async function getProjectSplit(organizationId: string, projectId: string, finance: ProjectFinanceRow) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_splits")
    .select("role, share_bps, partner:partners(id, full_name)")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  if (error) throw new Error(`Could not load the split: ${error.message}`);
  const policy = { originationBps: finance.origination_bps, deliveryBps: finance.delivery_bps };
  const rows = (data ?? []) as unknown as { role: "origination" | "delivery"; share_bps: number; partner: { id: string; full_name: string } | null }[];
  const amounts = partnerAmounts(
    finance.contract_cents,
    rows.map((r) => ({ partnerId: r.partner?.full_name ?? "?", role: r.role, shareBps: r.share_bps })),
    policy,
  );
  return { policy, pools: splitPools(finance.contract_cents, policy), lines: amounts };
}

// Per partner, across all projects with finances: owed on full contracts, paid, balance.
export async function getPartnerBalances(organizationId: string) {
  const supabase = await createClient();
  const [partners, splits, finances, payouts] = await Promise.all([
    supabase.from("partners").select("id, full_name, user_id").eq("organization_id", organizationId).order("full_name"),
    supabase.from("project_splits").select("project_id, partner_id, role, share_bps").eq("organization_id", organizationId),
    supabase.from("project_finances").select("project_id, contract_cents, origination_bps, delivery_bps").eq("organization_id", organizationId),
    supabase.from("partner_payouts").select("id, partner_id, amount_cents, paid_month, description").eq("organization_id", organizationId).order("paid_month", { nullsFirst: false }),
  ]);
  const failed = [partners, splits, finances, payouts].find((r) => r.error);
  if (failed?.error) throw new Error(`Could not load partner balances: ${failed.error.message}`);

  const financeByProject = new Map((finances.data ?? []).map((f) => [f.project_id, f]));
  const rows = new Map(
    (partners.data ?? []).map((p) => [p.id, { id: p.id, name: p.full_name, hasAccount: Boolean(p.user_id), origination: BigInt(0), delivery: BigInt(0), paid: BigInt(0) }]),
  );
  for (const s of splits.data ?? []) {
    const f = financeByProject.get(s.project_id);
    const row = rows.get(s.partner_id);
    if (!f || !row) continue;
    const [a] = partnerAmounts(f.contract_cents, [{ partnerId: s.partner_id, role: s.role, shareBps: s.share_bps }], {
      originationBps: f.origination_bps,
      deliveryBps: f.delivery_bps,
    });
    row[s.role] += a.cents;
  }
  for (const p of payouts.data ?? []) {
    const row = rows.get(p.partner_id);
    if (row) row.paid += BigInt(p.amount_cents);
  }
  const names = new Map((partners.data ?? []).map((p) => [p.id, p.full_name]));
  return {
    partners: [...rows.values()].map((r) => ({ ...r, owed: r.origination + r.delivery, balance: r.origination + r.delivery - r.paid })),
    payouts: (payouts.data ?? []).map((p) => ({ ...p, partner: names.get(p.partner_id) ?? "—" })),
  };
}

// Every project's split lines (admins only via RLS; others get an empty list).
export async function listProjectSplits(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_splits")
    .select("project_id, role, share_bps, partner:partners(id, full_name)")
    .eq("organization_id", organizationId);
  if (error) throw new Error(`Could not load the split: ${error.message}`);
  const byProject = new Map<string, { partnerId: string; partnerName: string; role: "origination" | "delivery"; shareBps: number }[]>();
  for (const r of (data ?? []) as unknown as { project_id: string; role: "origination" | "delivery"; share_bps: number; partner: { id: string; full_name: string } | null }[]) {
    if (!r.partner) continue;
    const list = byProject.get(r.project_id) ?? [];
    list.push({ partnerId: r.partner.id, partnerName: r.partner.full_name, role: r.role, shareBps: r.share_bps });
    byProject.set(r.project_id, list);
  }
  return byProject;
}

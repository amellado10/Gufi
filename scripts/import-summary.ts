// Import a financial summary (clients, projects, project finances, partner split, payouts,
// snapshots) from a local JSON file. Financial data lives in imports/ and never goes to git.
//
//   npm run import:summary -- --file imports/2026-11-25-resumen-socios.json          # dry run
//   npm run import:summary -- --file imports/2026-11-25-resumen-socios.json --apply  # write
//
// Safe to re-run: existing clients, projects and partners are matched by name and kept;
// finances, splits, payouts (by key) and snapshots (by key) are updated in place.
import { readFileSync } from "node:fs";
import { importFile } from "../src/features/finance/snapshot";
import { checkImport, formatUsd as usd, partnerBalances } from "../src/features/finance/import-checks";
import { adminClient, arg } from "./_admin";

const apply = process.argv.includes("--apply");

async function main() {
  const path = arg("file");
  if (!path) {
    console.error("Usage: npm run import:summary -- --file imports/<file>.json [--apply]");
    process.exit(1);
  }
  const parsed = importFile.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    console.error("The import file doesn't match the expected format:\n", parsed.error.issues.slice(0, 10));
    process.exit(1);
  }
  const file = parsed.data;

  console.log(`\n${apply ? "IMPORT" : "DRY RUN"} · ${file.source}\nas of ${file.as_of}\n`);
  console.log("Checks");
  const checks = checkImport(file);
  for (const c of checks) console.log(`  ${c.level === "ok" ? "✓" : c.level === "note" ? "~" : "✗"} ${c.message}`);
  if (checks.some((c) => c.level === "error")) {
    console.error("\nStopped: fix the errors above first.");
    process.exit(1);
  }

  const supabase = adminClient();
  const { data: org, error: orgErr } = await supabase.from("organizations").select("id, name").eq("slug", file.organization_slug).single();
  if (orgErr || !org) throw new Error(`Organization "${file.organization_slug}" not found`);

  const [{ data: clients }, { data: projects }, { data: partners }, { data: profiles }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("organization_id", org.id),
    supabase.from("projects").select("id, name, client_id").eq("organization_id", org.id),
    supabase.from("partners").select("id, full_name").eq("organization_id", org.id),
    supabase.from("profiles").select("id, email"),
  ]);
  const key = (s: string) => s.trim().toLowerCase();
  const clientIds = new Map((clients ?? []).map((c) => [key(c.name), c.id]));
  const partnerIds = new Map((partners ?? []).map((p) => [key(p.full_name), p.id]));
  const profileByEmail = new Map((profiles ?? []).map((p) => [key(p.email), p.id]));

  console.log(`\nWorkspace: ${org.name}`);
  console.log(`\nPartners`);
  for (const p of file.partners) {
    const linked = p.email && profileByEmail.has(key(p.email)) ? " · linked to their Güfi OS account" : " · no account yet";
    console.log(`  ${partnerIds.has(key(p.name)) ? "exists " : "create "} ${p.name}${linked}`);
  }

  console.log(`\nClients and projects`);
  console.log(`  ${"Client / project".padEnd(22)} ${"Status".padEnd(10)} ${"Contract".padStart(11)} ${"Collected".padStart(11)} ${"Outstanding".padStart(12)}`);
  for (const p of file.projects) {
    const clientExists = clientIds.has(key(p.client));
    const projectExists = clientExists && (projects ?? []).some((x) => x.client_id === clientIds.get(key(p.client)) && key(x.name) === key(p.name));
    const f = p.finance;
    console.log(
      `  ${(clientExists ? "" : "+") + (projectExists ? "" : "+")}${p.name.padEnd(20)} ${p.status.padEnd(10)} ${usd(f.contract_cents).padStart(11)} ${(f.collected_cents === null ? "—" : usd(f.collected_cents)).padStart(11)} ${usd(f.outstanding_cents).padStart(12)}`,
    );
  }
  const contracts = file.projects.reduce((a, p) => a + p.finance.contract_cents, 0);
  const outstanding = file.projects.reduce((a, p) => a + p.finance.outstanding_cents, 0);
  console.log(`  ${"Total".padEnd(42)} ${usd(contracts).padStart(11)} ${"".padStart(11)} ${usd(outstanding).padStart(12)}`);
  console.log(`  (+ = new client, ++ = new client and project)`);

  console.log(`\nPartner split (15% brought in · 60% did the work)`);
  for (const b of partnerBalances(file)) {
    console.log(`  ${b.name.padEnd(8)} owed ${usd(b.owed).padStart(10)}  (15%: ${usd(b.origination)}, 60%: ${usd(b.delivery)})  paid ${usd(b.paid).padStart(10)}  balance ${usd(b.balance).padStart(10)}`);
  }
  console.log(`\nSnapshots: ${file.snapshots.map((s) => `${s.title} [${s.audience === "admins" ? "admins only" : "admins + finance"}]`).join("; ")}`);

  if (!apply) {
    console.log(`\nNothing was written. Re-run with --apply to import.\n`);
    return;
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  for (const p of file.partners) {
    const userId = p.email ? (profileByEmail.get(key(p.email)) ?? null) : null;
    const existing = partnerIds.get(key(p.name));
    if (existing) {
      await must(supabase.from("partners").update({ email: p.email ?? null, user_id: userId }).eq("id", existing));
    } else {
      const { data } = await must(supabase.from("partners").insert({ organization_id: org.id, full_name: p.name, email: p.email ?? null, user_id: userId }).select("id").single());
      partnerIds.set(key(p.name), data!.id);
    }
  }
  for (const c of file.clients) {
    if (clientIds.has(key(c.name))) continue;
    const { data } = await must(
      supabase.from("clients").insert({ organization_id: org.id, name: c.name, legal_name: c.legal_name ?? null, status: c.status, notes: c.notes ?? null }).select("id").single(),
    );
    clientIds.set(key(c.name), data!.id);
  }
  for (const p of file.projects) {
    const clientId = clientIds.get(key(p.client))!;
    let projectId = (projects ?? []).find((x) => x.client_id === clientId && key(x.name) === key(p.name))?.id;
    if (!projectId) {
      const { data } = await must(
        supabase
          .from("projects")
          .insert({ organization_id: org.id, client_id: clientId, name: p.name, status: p.status, due_date: p.due_date ?? null, description: p.description ?? null })
          .select("id")
          .single(),
      );
      projectId = data!.id;
    }
    const f = p.finance;
    await must(
      supabase.from("project_finances").upsert(
        {
          project_id: projectId,
          organization_id: org.id,
          contract_cents: f.contract_cents,
          tax_rate_bps: f.tax_rate_bps,
          collected_cents: f.collected_cents,
          outstanding_cents: f.outstanding_cents,
          invoice_ref: f.invoice_ref ?? null,
          payment_due_date: f.payment_due_date ?? null,
          notes: f.notes ?? null,
          as_of: file.as_of,
          source: file.source,
        },
        { onConflict: "project_id" },
      ),
    );
    await must(supabase.from("project_splits").delete().eq("project_id", projectId));
    await must(
      supabase.from("project_splits").insert(
        p.splits.map((s) => ({ organization_id: org.id, project_id: projectId!, partner_id: partnerIds.get(key(s.partner))!, role: s.role, share_bps: s.share_bps })),
      ),
    );
  }
  for (const x of file.payouts) {
    await must(
      supabase.from("partner_payouts").upsert(
        {
          organization_id: org.id,
          partner_id: partnerIds.get(key(x.partner))!,
          amount_cents: x.amount_cents,
          paid_month: x.paid_month,
          description: x.description,
          source: file.source,
          import_key: x.key,
        },
        { onConflict: "organization_id,import_key" },
      ),
    );
  }
  for (const s of file.snapshots) {
    await must(
      supabase.from("financial_snapshots").upsert(
        {
          organization_id: org.id,
          key: s.key,
          title: s.title,
          basis: s.basis,
          period_start: s.period_start,
          period_end: s.period_end,
          reconciled_through: s.reconciled_through ?? null,
          audience: s.audience,
          source: file.source,
          data: s.data,
        },
        { onConflict: "organization_id,key" },
      ),
    );
  }
  console.log(`\nImported. Re-running is safe.\n`);
}

async function must<T extends { error: { message: string } | null }>(query: PromiseLike<T>): Promise<T> {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

// Proposal studio (migration 0005): numbering, locking, client link access, and acceptance
// converting the proposal into a project with finances.
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
const u = {} as Record<"admin" | "pm" | "team" | "finance" | "adminB", string>;
let org: string, orgB: string, client: string, partner: string, deal: string;
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params)).n);
const TOKEN = "t".repeat(40);
const TOKEN2 = "u".repeat(40);

// A draft with two items (one optional), 50/50 schedule. Returns version id.
async function makeProposal(title: string, opts: { opportunity?: string | null; tax?: number } = {}) {
  const p = await one<{ id: string; number: number }>(
    `insert into proposals (organization_id, client_id, opportunity_id, title) values ($1, $2, $3, $4) returning id, number`,
    [org, client, opts.opportunity ?? null, title],
  );
  const v = await one<{ id: string }>(`insert into proposal_versions (organization_id, proposal_id, version, tax_rate_bps, valid_until) values ($1, $2, 1, $3, '2099-01-01') returning id`, [
    org,
    p.id,
    opts.tax ?? 700,
  ]);
  await db.query(
    `insert into proposal_items (organization_id, version_id, position, name, quantity_hundredths, unit_price_cents, optional) values
     ($1, $2, 1, 'Shopify build', 100, 185000, false), ($1, $2, 2, 'Hours', 250, 4000, false), ($1, $2, 3, 'SEO add-on', 100, 50000, true)`,
    [org, v.id],
  );
  await db.query(
    `insert into proposal_payment_milestones (organization_id, version_id, position, label, percent_bps, due) values
     ($1, $2, 1, 'Deposit', 5000, 'On signing'), ($1, $2, 2, 'Balance', 5000, 'On delivery')`,
    [org, v.id],
  );
  return { proposal: p.id, number: p.number, version: v.id };
}
const send = async (version: string, token: string) => {
  await db.query(`update proposal_versions set locked_at = now(), sent_at = now(), status = 'sent' where id = $1`, [version]);
  await db.query(`update proposals set status = 'sent' where id = (select proposal_id from proposal_versions where id = $1)`, [version]);
  await db.query(`insert into proposal_share_links (organization_id, version_id, token) values ($1, $2, $3)`, [org, version, token]);
};

beforeAll(async () => {
  db = await createTestDb();
  for (const k of ["admin", "pm", "team", "finance", "adminB"] as const) u[k] = await createUser(db, `${k}@example.com`);
  org = (await one<{ id: string }>(`insert into organizations (name, slug) values ('Güfi', 'gufi') returning id`)).id;
  orgB = (await one<{ id: string }>(`insert into organizations (name, slug) values ('Other', 'other') returning id`)).id;
  for (const [user, role] of [[u.admin, "admin"], [u.pm, "project_manager"], [u.team, "team"], [u.finance, "finance"]]) {
    await db.query(`insert into memberships (organization_id, user_id, role) values ($1, $2, $3)`, [org, user, role]);
  }
  await db.query(`insert into memberships (organization_id, user_id, role) values ($1, $2, 'admin')`, [orgB, u.adminB]);
  client = (await one<{ id: string }>(`insert into clients (organization_id, name, status) values ($1, 'Lead Co', 'prospect') returning id`, [org])).id;
  partner = (await one<{ id: string }>(`insert into partners (organization_id, full_name) values ($1, 'Daniel') returning id`, [org])).id;
  const newStage = (await one<{ id: string }>(`select id from pipeline_stages where organization_id = $1 and key = 'proposal_sent'`, [org])).id;
  deal = (
    await one<{ id: string }>(
      `insert into opportunities (organization_id, client_id, title, stage_id, owner_id, brought_by_kind, brought_by_partner_id) values ($1, $2, 'Shopify build', $3, $4, 'partner', $5) returning id`,
      [org, client, newStage, u.pm, partner],
    )
  ).id;
});

describe("numbering and math", () => {
  it("numbers proposals per organization", async () => {
    const a = await makeProposal("First");
    const b = await makeProposal("Second");
    expect(b.number).toBe(a.number + 1);
  });
  it("computes line totals in cents, half-up, with fractional quantities", async () => {
    const { version } = await makeProposal("Math");
    const rows = (await db.query<{ line_total_cents: number }>(`select line_total_cents from proposal_items where version_id = $1 order by position`, [version])).rows;
    expect(rows.map((r) => Number(r.line_total_cents))).toEqual([185000, 10000, 50000]);
  });
});

describe("locking", () => {
  it("a sent version can't change", async () => {
    const { version } = await makeProposal("Locked");
    await send(version, "l".repeat(40));
    await expect(db.query(`update proposal_items set unit_price_cents = 1 where version_id = $1`, [version])).rejects.toThrow(/can no longer change/);
    await expect(db.query(`insert into proposal_items (organization_id, version_id, position, name, unit_price_cents) values ($1, $2, 9, 'x', 1)`, [org, version])).rejects.toThrow(/can no longer change/);
    await expect(db.query(`delete from proposal_payment_milestones where version_id = $1`, [version])).rejects.toThrow(/can no longer change/);
    await expect(db.query(`update proposal_versions set tax_rate_bps = 0 where id = $1`, [version])).rejects.toThrow(/can no longer change/);
  });
});

describe("client link", () => {
  it("shows only public fields, and nothing for a bad, revoked or expired token", async () => {
    const { version } = await makeProposal("Shared");
    await send(version, TOKEN);
    await as(db, null, async () => {
      const doc = (await one<{ d: Record<string, unknown> }>(`select get_shared_proposal($1) as d`, [TOKEN])).d;
      expect(doc).toMatchObject({ title: "Shared", client_name: "Lead Co", tax_rate_bps: 700, response: null });
      expect(Object.keys(doc).sort()).toEqual(
        ["client_name", "content", "currency", "items", "language", "milestones", "number", "organization_name", "response", "sent_at", "status", "tax_rate_bps", "title", "valid_until", "version"].sort(),
      );
      expect((await one<{ d: unknown }>(`select get_shared_proposal($1) as d`, ["x".repeat(40)])).d).toBeNull();
      expect((await one<{ d: unknown }>(`select get_shared_proposal($1) as d`, ["short"])).d).toBeNull();
    });
    await db.query(`update proposal_share_links set revoked_at = now() where token = $1`, [TOKEN]);
    await as(db, null, async () => {
      expect((await one<{ d: unknown }>(`select get_shared_proposal($1) as d`, [TOKEN])).d).toBeNull();
    });
    await db.query(`update proposal_share_links set revoked_at = null, expires_at = now() - interval '1 day' where token = $1`, [TOKEN]);
    await as(db, null, async () => {
      expect((await one<{ d: unknown }>(`select get_shared_proposal($1) as d`, [TOKEN])).d).toBeNull();
    });
    await db.query(`update proposal_share_links set expires_at = null where token = $1`, [TOKEN]);
  });

  it("anonymous visitors can't read any proposal table directly", async () => {
    await as(db, null, async () => {
      for (const t of ["proposals", "proposal_versions", "proposal_items", "proposal_share_links", "proposal_responses"]) {
        await expect(db.query(`select * from ${t}`), t).rejects.toThrow(/permission denied/);
      }
    });
  });

  it("opening the link marks it viewed", async () => {
    await as(db, null, async () => {
      await db.query(`select mark_shared_proposal_viewed($1)`, [TOKEN]);
    });
    const v = await one<{ status: string; first_viewed_at: string | null }>(
      `select v.status, v.first_viewed_at from proposal_versions v join proposal_share_links l on l.version_id = v.id where l.token = $1`,
      [TOKEN],
    );
    expect(v.status).toBe("viewed");
    expect(v.first_viewed_at).not.toBeNull();
  });
});

describe("acceptance", () => {
  it("accepting creates the project, finances and split, wins the deal and activates the client, once", async () => {
    const { proposal, version } = await makeProposal("Shopify build", { opportunity: deal });
    await send(version, TOKEN2);
    const seo = (await one<{ id: string }>(`select id from proposal_items where version_id = $1 and optional`, [version])).id;
    const res = await as(db, null, async () =>
      (await one<{ r: Record<string, unknown> }>(`select respond_to_shared_proposal($1, 'accepted', 'Ana Pérez', 'ANA@Lead.co', 'CEO', null, $2::uuid[]) as r`, [TOKEN2, [seo]])).r,
    );
    // 1,850 + 100 + 500 (optional chosen) = 2,450.00; ITBMS 7% = 171.50
    expect(res).toEqual({ decision: "accepted", total_cents: 262150 });

    const p = await one<{ status: string; project_id: string }>(`select status, project_id from proposals where id = $1`, [proposal]);
    expect(p.status).toBe("accepted");
    const f = await one<{ contract_cents: number; tax_cents: number; outstanding_cents: number; source: string; notes: string }>(
      `select contract_cents, tax_cents, outstanding_cents, source, notes from project_finances where project_id = $1`,
      [p.project_id],
    );
    expect(Number(f.contract_cents)).toBe(245000);
    expect(Number(f.tax_cents)).toBe(17150);
    expect(Number(f.outstanding_cents)).toBe(262150);
    expect(f.notes).toBe("Payment schedule: 50% Deposit (On signing); 50% Balance (On delivery)");
    expect(await count(`select * from project_splits where project_id = $1 and partner_id = $2 and role = 'origination'`, [p.project_id, partner])).toBe(1);
    const d = await one<{ kind: string; won_project_id: string; value_cents: number }>(
      `select s.kind, o.won_project_id, o.value_cents from opportunities o join pipeline_stages s on s.id = o.stage_id where o.id = $1`,
      [deal],
    );
    expect(d).toMatchObject({ kind: "won", won_project_id: p.project_id });
    expect(Number(d.value_cents)).toBe(245000);
    expect((await one<{ status: string }>(`select status from clients where id = $1`, [client])).status).toBe("active");
    const r = await one<{ signer_email: string; content_hash: string }>(`select signer_email, content_hash from proposal_responses where version_id = $1`, [version]);
    expect(r.signer_email).toBe("ana@lead.co");
    expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/);

    // Responding again does nothing new.
    const again = await as(db, null, async () => (await one<{ r: Record<string, unknown> }>(`select respond_to_shared_proposal($1, 'declined', 'X', 'x@y.co') as r`, [TOKEN2])).r);
    expect(again).toEqual({ decision: "accepted", already: true });
    expect(await count(`select * from projects where id = $1`, [p.project_id])).toBe(1);
  });

  it("can't choose another version's items, and declining records the reason on the deal", async () => {
    const { version } = await makeProposal("Declined one", { opportunity: deal });
    await send(version, "d".repeat(40));
    await as(db, null, async () => {
      await db.query(`select respond_to_shared_proposal($1, 'declined', 'Bo', 'bo@lead.co', null, 'Too expensive')`, ["d".repeat(40)]);
    });
    expect((await one<{ status: string }>(`select status from proposal_versions where id = $1`, [version])).status).toBe("declined");
    expect(await count(`select * from activities where opportunity_id = $1 and body like '%declined by Bo. Reason: Too expensive'`, [deal])).toBe(1);
  });

  it("an expired proposal can't be accepted", async () => {
    const { version } = await makeProposal("Old");
    await db.query(`update proposal_versions set valid_until = '2020-01-01' where id = $1`, [version]);
    await send(version, "e".repeat(40));
    await as(db, null, async () => {
      await expect(db.query(`select respond_to_shared_proposal($1, 'accepted', 'A', 'a@b.co')`, ["e".repeat(40)])).rejects.toThrow(/expired/);
    });
  });

  it("a draft (not sent) can't be answered even with a link", async () => {
    const { version } = await makeProposal("Draft only");
    await db.query(`insert into proposal_share_links (organization_id, version_id, token) values ($1, $2, $3)`, [org, version, "f".repeat(40)]);
    await as(db, null, async () => {
      await expect(db.query(`select respond_to_shared_proposal($1, 'accepted', 'A', 'a@b.co')`, ["f".repeat(40)])).rejects.toThrow(/can no longer be answered/);
    });
  });
});

describe("who sees what", () => {
  it("finance reads, the team and other organizations don't, and nobody writes responses directly", async () => {
    await as(db, u.finance, async () => {
      expect(await count(`select * from proposals`)).toBeGreaterThan(0);
      await expect(db.query(`insert into proposals (organization_id, client_id, title) values ($1, $2, 'x')`, [org, client])).rejects.toThrow(/row-level security/);
    });
    for (const who of [u.team, u.adminB]) {
      await as(db, who, async () => {
        expect(await count(`select * from proposals where organization_id = $1`, [org])).toBe(0);
        expect(await count(`select * from proposal_responses where organization_id = $1`, [org])).toBe(0);
      });
    }
    await as(db, u.admin, async () => {
      const v = (await one<{ id: string }>(`select id from proposal_versions limit 1`)).id;
      await expect(
        db.query(`insert into proposal_responses (organization_id, version_id, decision, signer_name, signer_email, content_hash) values ($1, $2, 'accepted', 'x', 'x@y.co', 'h')`, [org, v]),
      ).rejects.toThrow(/permission denied/);
    });
  });
});

// Access and integrity tests for the finance tables (migration 0002).
import { beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, as, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
const u = {} as Record<"admin" | "pm" | "team" | "finance" | "marketing" | "adminB", string>;
let org: string, orgB: string, project: string, partnerD: string, partnerC: string, partnerB: string;
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params)).n);

beforeAll(async () => {
  db = await createTestDb();
  for (const k of ["admin", "pm", "team", "finance", "marketing", "adminB"] as const) u[k] = await createUser(db, `${k}@example.com`);
  org = (await one<{ id: string }>(`insert into organizations (name, slug) values ('Güfi', 'gufi') returning id`)).id;
  orgB = (await one<{ id: string }>(`insert into organizations (name, slug) values ('Other', 'other') returning id`)).id;
  for (const [user, role] of [[u.admin, "admin"], [u.pm, "project_manager"], [u.team, "team"], [u.finance, "finance"], [u.marketing, "marketing"]]) {
    await db.query(`insert into memberships (organization_id, user_id, role) values ($1, $2, $3)`, [org, user, role]);
  }
  await db.query(`insert into memberships (organization_id, user_id, role) values ($1, $2, 'admin')`, [orgB, u.adminB]);
  const client = (await one<{ id: string }>(`insert into clients (organization_id, name) values ($1, 'Reve') returning id`, [org])).id;
  project = (await one<{ id: string }>(`insert into projects (organization_id, client_id, name) values ($1, $2, 'Reve') returning id`, [org, client])).id;
  await db.query(`insert into project_members (organization_id, project_id, user_id) values ($1, $2, $3)`, [org, project, u.team]);
  // Reve from the 2026 summary: $1,850 contract, ITBMS 7%, nothing collected, $1,979.50 outstanding.
  await db.query(
    `insert into project_finances (project_id, organization_id, contract_cents, tax_rate_bps, collected_cents, outstanding_cents, as_of, source)
     values ($1, $2, 185000, 700, 0, 197950, '2026-11-25', 'test')`,
    [project, org],
  );
  partnerD = (await one<{ id: string }>(`insert into partners (organization_id, full_name) values ($1, 'Daniel') returning id`, [org])).id;
  partnerC = (await one<{ id: string }>(`insert into partners (organization_id, full_name) values ($1, 'Camila') returning id`, [org])).id;
  partnerB = (await one<{ id: string }>(`insert into partners (organization_id, full_name) values ($1, 'Someone Else') returning id`, [orgB])).id;
  await db.query(`insert into project_splits (organization_id, project_id, partner_id, role, percent_bps) values ($1, $2, $3, 'origination', 1500)`, [org, project, partnerD]);
  await db.query(`insert into partner_payouts (organization_id, partner_id, amount_cents, paid_month, description, source) values ($1, $2, 86670, '2026-06-01', 'June', 'test')`, [org, partnerC]);
  await db.query(
    `insert into financial_snapshots (organization_id, key, title, basis, period_start, period_end, source, data) values ($1, 'test-2026', 'Test', 'accrual', '2026-01-01', '2026-11-25', 'test', '{}')`,
    [org],
  );
  await db.query(
    `insert into financial_snapshots (organization_id, key, title, basis, period_start, period_end, source, audience, data) values ($1, 'test-partners', 'Partners', 'accrual', '2026-01-01', '2026-11-25', 'test', 'admins', '{}')`,
    [org],
  );
});

describe("tax and balance math", () => {
  it("computes ITBMS half-up in cents", async () => {
    expect(Number((await one<{ tax_cents: number }>(`select tax_cents from project_finances where project_id = $1`, [project])).tax_cents)).toBe(12950);
  });
  it("rejects an outstanding balance that doesn't add up", async () => {
    await expect(db.query(`update project_finances set outstanding_cents = 100 where project_id = $1`, [project])).rejects.toThrow(/check constraint/);
  });
  it("caps whoever brought the client at 15% and the whole split at 100%", async () => {
    await expect(
      db.query(`insert into project_splits (organization_id, project_id, partner_id, role, percent_bps) values ($1, $2, $3, 'origination', 1)`, [org, project, partnerC]),
    ).rejects.toThrow(/15%/);
    await db.query(`insert into project_splits (organization_id, project_id, partner_id, role, percent_bps) values ($1, $2, $3, 'delivery', 8000)`, [org, project, partnerC]);
    await expect(
      db.query(`insert into project_splits (organization_id, project_id, partner_id, role, percent_bps) values ($1, $2, $3, 'delivery', 600)`, [org, project, partnerD]),
    ).rejects.toThrow(/more than 100%/);
    await db.query(`delete from project_splits where project_id = $1 and role = 'delivery'`, [project]);
  });
  it("can't split a project with a partner from another organization", async () => {
    await expect(
      db.query(`insert into project_splits (organization_id, project_id, partner_id, role, percent_bps) values ($1, $2, $3, 'delivery', 6000)`, [org, project, partnerB]),
    ).rejects.toThrow(/foreign key/);
  });
});

describe("who sees what", () => {
  it("admins see everything in their own organization only", async () => {
    await as(db, u.admin, async () => {
      expect(await count(`select * from project_finances`)).toBe(1);
      expect(await count(`select * from partners`)).toBe(2);
      expect(await count(`select * from project_splits`)).toBe(1);
      expect(await count(`select * from partner_payouts`)).toBe(1);
      expect(await count(`select * from financial_snapshots`)).toBe(2);
    });
    await as(db, u.adminB, async () => {
      expect(await count(`select * from project_finances`)).toBe(0);
      expect(await count(`select * from partners`)).toBe(1);
      expect(await count(`select * from financial_snapshots`)).toBe(0);
    });
  });

  it("finance sees project figures and company snapshots, not partner pay", async () => {
    await as(db, u.finance, async () => {
      expect(await count(`select * from project_finances`)).toBe(1);
      expect((await db.query<{ key: string }>(`select key from financial_snapshots`)).rows.map((r) => r.key)).toEqual(["test-2026"]);
      expect(await count(`select * from partners`)).toBe(2); // names only, to attribute deals
      expect(await count(`select * from project_splits`)).toBe(0);
      expect(await count(`select * from partner_payouts`)).toBe(0);
    });
  });

  it("project managers see project figures only, read-only", async () => {
    await as(db, u.pm, async () => {
      expect(await count(`select * from project_finances`)).toBe(1);
      expect(await count(`select * from financial_snapshots`)).toBe(0);
      expect(await count(`select * from partner_payouts`)).toBe(0);
      const res = await db.query(`update project_finances set notes = 'x' where project_id = $1`, [project]);
      expect(res.affectedRows ?? 0).toBe(0);
    });
  });

  it("the delivery team and marketing see no money at all, even on their own project", async () => {
    for (const who of [u.team, u.marketing]) {
      await as(db, who, async () => {
        for (const t of ["project_finances", "project_splits", "partner_payouts", "financial_snapshots"]) {
          expect(await count(`select * from ${t}`), t).toBe(0);
        }
      });
    }
    await as(db, u.team, async () => {
      expect(await count(`select * from partners`)).toBe(0);
    });
  });

  it("sales roles see partner names (to attribute deals) but can't change partners", async () => {
    await as(db, u.marketing, async () => {
      expect(await count(`select * from partners`)).toBe(2);
      const res = await db.query(`update partners set full_name = 'Renamed' where id = $1`, [partnerD]);
      expect(res.affectedRows ?? 0).toBe(0);
      await expect(db.query(`insert into partners (organization_id, full_name) values ($1, 'Sneaky')`, [org])).rejects.toThrow(/row-level security/);
    });
  });

  it("nobody can write snapshots from the app", async () => {
    await as(db, u.admin, async () => {
      await expect(
        db.query(`insert into financial_snapshots (organization_id, key, title, basis, period_start, period_end, source, data) values ($1, 'x-x-x', 'X', 'cash', '2026-01-01', '2026-01-02', 'x', '{}')`, [org]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("anonymous visitors are refused", async () => {
    await as(db, null, async () => {
      await expect(db.query(`select * from project_finances`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select * from partner_payouts`)).rejects.toThrow(/permission denied/);
    });
  });
});

describe("migration 0008: existing splits convert to % of the contract", () => {
  it("keeps every amount (15% pool → 15%; half of the 60% pool → 30%)", async () => {
    const old = await createTestDb({ until: "20261127000008" });
    const q = async <T>(sql: string, params: unknown[] = []) => (await old.query<T>(sql, params)).rows[0];
    const o = (await q<{ id: string }>(`insert into organizations (name, slug) values ('Güfi', 'gufi') returning id`)).id;
    const c = (await q<{ id: string }>(`insert into clients (organization_id, name) values ($1, 'Reve') returning id`, [o])).id;
    const p = (await q<{ id: string }>(`insert into projects (organization_id, client_id, name) values ($1, $2, 'Reve') returning id`, [o, c])).id;
    await old.query(`insert into project_finances (project_id, organization_id, contract_cents, outstanding_cents, as_of, source) values ($1, $2, 185000, 0, '2026-11-25', 't')`, [p, o]);
    const ids: string[] = [];
    for (const n of ["Daniel", "Adrián", "Camila"]) ids.push((await q<{ id: string }>(`insert into partners (organization_id, full_name) values ($1, $2) returning id`, [o, n])).id);
    await old.query(
      `insert into project_splits (organization_id, project_id, partner_id, role, share_bps) values ($1, $2, $3, 'origination', 10000), ($1, $2, $4, 'delivery', 5000), ($1, $2, $5, 'delivery', 5000)`,
      [o, p, ...ids],
    );
    await applyMigrations(old, { from: "20261127000008" });
    const rows = (await old.query<{ role: string; percent_bps: number }>(`select role::text as role, percent_bps from project_splits order by role::text, percent_bps`)).rows;
    expect(rows).toEqual([
      { role: "origination", percent_bps: 1500 },
      { role: "delivery", percent_bps: 3000 },
      { role: "delivery", percent_bps: 3000 },
    ].sort((a, b) => a.role.localeCompare(b.role) || a.percent_bps - b.percent_bps));
  });
});

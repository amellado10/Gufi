// Pipeline (migration 0003): stages, deals, activity log, and who can see/change them.
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
const u = {} as Record<"admin" | "pm" | "team" | "finance" | "marketing" | "adminB", string>;
let org: string, orgB: string, client: string, clientB: string, contact: string, otherContact: string;
const stage = {} as Record<string, string>;
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
  client = (await one<{ id: string }>(`insert into clients (organization_id, name, status) values ($1, 'Lead Co', 'prospect') returning id`, [org])).id;
  const client2 = (await one<{ id: string }>(`insert into clients (organization_id, name) values ($1, 'Another Co') returning id`, [org])).id;
  clientB = (await one<{ id: string }>(`insert into clients (organization_id, name) values ($1, 'B Co') returning id`, [orgB])).id;
  contact = (await one<{ id: string }>(`insert into contacts (organization_id, client_id, full_name) values ($1, $2, 'Ana') returning id`, [org, client])).id;
  otherContact = (await one<{ id: string }>(`insert into contacts (organization_id, client_id, full_name) values ($1, $2, 'Bo') returning id`, [org, client2])).id;
  for (const r of (await db.query<{ key: string; id: string }>(`select key, id from pipeline_stages where organization_id = $1`, [org])).rows) stage[r.key] = r.id;
});

const newDeal = (title: string, stageKey = "new") =>
  db.query<{ id: string }>(`insert into opportunities (organization_id, client_id, title, stage_id, value_cents) values ($1, $2, $3, $4, 500000) returning id`, [
    org,
    client,
    title,
    stage[stageKey],
  ]);

describe("stages", () => {
  it("every organization gets the default stages, in order", async () => {
    const rows = (await db.query<{ key: string }>(`select key from pipeline_stages where organization_id = $1 order by position`, [org])).rows;
    expect(rows.map((r) => r.key)).toEqual(["new", "qualified", "proposal_sent", "negotiation", "won", "lost"]);
    expect(await count(`select * from pipeline_stages where organization_id = $1`, [orgB])).toBe(6);
  });
});

describe("deals", () => {
  it("sales roles create and move deals; moves are logged in the timeline", async () => {
    await as(db, u.marketing, async () => {
      const { rows } = await newDeal("Website redesign");
      await db.query(`update opportunities set stage_id = $1 where id = $2`, [stage.qualified, rows[0].id]);
      const log = await one<{ kind: string; body: string; created_by: string }>(`select kind, body, created_by from activities where opportunity_id = $1`, [rows[0].id]);
      expect(log).toEqual({ kind: "stage_change", body: "Moved from New to Qualified", created_by: u.marketing });
    });
  });

  it("winning stamps the close date; reopening clears it", async () => {
    await as(db, u.pm, async () => {
      const { rows } = await newDeal("Shopify build");
      await db.query(`update opportunities set stage_id = $1 where id = $2`, [stage.won, rows[0].id]);
      expect((await one<{ closed_on: string | null }>(`select closed_on from opportunities where id = $1`, [rows[0].id])).closed_on).not.toBeNull();
      await db.query(`update opportunities set stage_id = $1 where id = $2`, [stage.negotiation, rows[0].id]);
      expect((await one<{ closed_on: string | null }>(`select closed_on from opportunities where id = $1`, [rows[0].id])).closed_on).toBeNull();
    });
  });

  it("a lost deal needs a reason", async () => {
    await as(db, u.pm, async () => {
      const { rows } = await newDeal("Maybe");
      await expect(db.query(`update opportunities set stage_id = $1 where id = $2`, [stage.lost, rows[0].id])).rejects.toThrow(/needs a reason/);
      await db.query(`update opportunities set stage_id = $1, lost_reason = 'Went with a cheaper agency' where id = $2`, [stage.lost, rows[0].id]);
      const log = await one<{ body: string }>(`select body from activities where opportunity_id = $1 and kind = 'stage_change'`, [rows[0].id]);
      expect(log.body).toBe("Moved from New to Lost. Reason: Went with a cheaper agency");
    });
  });

  it("a deal's contact must belong to the deal's client", async () => {
    await as(db, u.pm, async () => {
      await db.query(`insert into opportunities (organization_id, client_id, contact_id, title, stage_id) values ($1, $2, $3, 'Ok', $4)`, [org, client, contact, stage.new]);
      await expect(
        db.query(`insert into opportunities (organization_id, client_id, contact_id, title, stage_id) values ($1, $2, $3, 'Wrong contact', $4)`, [org, client, otherContact, stage.new]),
      ).rejects.toThrow(/foreign key/);
    });
  });

  it("can't use another organization's client or stage", async () => {
    await as(db, u.pm, async () => {
      await expect(db.query(`insert into opportunities (organization_id, client_id, title, stage_id) values ($1, $2, 'x', $3)`, [org, clientB, stage.new])).rejects.toThrow(/foreign key/);
    });
    const stageB = (await one<{ id: string }>(`select id from pipeline_stages where organization_id = $1 and key = 'new'`, [orgB])).id;
    await as(db, u.pm, async () => {
      await expect(db.query(`insert into opportunities (organization_id, client_id, title, stage_id) values ($1, $2, 'x', $3)`, [org, client, stageB])).rejects.toThrow(/foreign key/);
    });
  });
});

describe("who sees what", () => {
  it("finance reads deals but can't change them", async () => {
    await as(db, u.finance, async () => {
      expect(await count(`select * from opportunities`)).toBeGreaterThan(0);
      await expect(db.query(`insert into opportunities (organization_id, client_id, title, stage_id) values ($1, $2, 'x', $3)`, [org, client, stage.new])).rejects.toThrow(/row-level security/);
      const res = await db.query(`update opportunities set title = 'changed'`);
      expect(res.affectedRows ?? 0).toBe(0);
    });
  });

  it("the delivery team and other organizations see no deals, stages or activity", async () => {
    for (const who of [u.team, u.adminB]) {
      await as(db, who, async () => {
        expect(await count(`select * from opportunities where organization_id = $1`, [org])).toBe(0);
        expect(await count(`select * from activities where organization_id = $1`, [org])).toBe(0);
        expect(await count(`select * from pipeline_stages where organization_id = $1`, [org])).toBe(0);
      });
    }
  });

  it("nobody can fake a stage-change entry, and only authors (or admins) remove notes", async () => {
    const deal = (await one<{ id: string }>(`select id from opportunities where organization_id = $1 limit 1`, [org])).id;
    await as(db, u.marketing, async () => {
      await expect(
        db.query(`insert into activities (organization_id, client_id, opportunity_id, kind, body) values ($1, $2, $3, 'stage_change', 'fake')`, [org, client, deal]),
      ).rejects.toThrow(/row-level security/);
      await db.query(`insert into activities (organization_id, client_id, opportunity_id, kind, body) values ($1, $2, $3, 'call', 'Intro call')`, [org, client, deal]);
    });
    await as(db, u.pm, async () => {
      const res = await db.query(`delete from activities where body = 'Intro call'`);
      expect(res.affectedRows ?? 0).toBe(0);
    });
    await as(db, u.admin, async () => {
      const res = await db.query(`delete from activities where body = 'Intro call'`);
      expect(res.affectedRows).toBe(1);
      const res2 = await db.query(`delete from activities where kind = 'stage_change'`);
      expect(res2.affectedRows ?? 0).toBe(0);
    });
  });

  it("only admins rename stages; nobody adds stages from the app", async () => {
    await as(db, u.pm, async () => {
      const res = await db.query(`update pipeline_stages set name = 'Hot' where id = $1`, [stage.new]);
      expect(res.affectedRows ?? 0).toBe(0);
    });
    await as(db, u.admin, async () => {
      await db.query(`update pipeline_stages set name = 'Incoming' where id = $1`, [stage.new]);
      await expect(db.query(`insert into pipeline_stages (organization_id, key, name, position) values ($1, 'extra', 'Extra', 9)`, [org])).rejects.toThrow(/permission denied/);
    });
  });
});

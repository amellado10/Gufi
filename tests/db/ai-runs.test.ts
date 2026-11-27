// AI usage log (migration 0006).
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let org: string, admin: string, pm: string, outsider: string;
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params)).n);

beforeAll(async () => {
  db = await createTestDb();
  admin = await createUser(db, "admin@example.com");
  pm = await createUser(db, "pm@example.com");
  outsider = await createUser(db, "out@example.com");
  org = (await one<{ id: string }>(`insert into organizations (name, slug) values ('Güfi', 'gufi') returning id`)).id;
  await db.query(`insert into memberships (organization_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'project_manager')`, [org, admin, pm]);
});

const log = (who: string) =>
  db.query(`insert into ai_runs (organization_id, user_id, feature, model, status, input_tokens, output_tokens) values ($1, $2, 'proposal.draft', 'claude-opus-5-5', 'succeeded', 10, 20)`, [org, who]);

describe("ai_runs", () => {
  it("members log their own runs; nobody logs for someone else or another organization", async () => {
    await as(db, pm, async () => {
      await log(pm);
      await expect(log(admin)).rejects.toThrow(/row-level security/);
    });
    await as(db, outsider, async () => {
      await expect(log(outsider)).rejects.toThrow(/row-level security/);
    });
  });
  it("people see their own runs, admins see all, and nobody edits or deletes", async () => {
    await as(db, admin, async () => {
      await log(admin);
      expect(await count(`select * from ai_runs`)).toBe(2);
      await expect(db.query(`delete from ai_runs`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`update ai_runs set status = 'failed'`)).rejects.toThrow(/permission denied/);
    });
    await as(db, pm, async () => {
      expect(await count(`select * from ai_runs`)).toBe(1);
    });
  });
});

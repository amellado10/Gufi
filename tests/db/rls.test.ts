// Security boundary tests: run the real migrations, then act as different users.
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
const u = {} as Record<"adminA" | "pmA" | "teamA" | "team2A" | "financeA" | "marketingA" | "adminB" | "outsider", string>;
let orgA: string, orgB: string, clientA: string, clientA2: string, clientB: string, projectA: string, projectA2: string;

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params)).n);

beforeAll(async () => {
  db = await createTestDb();
  for (const k of Object.keys({ adminA: 0, pmA: 0, teamA: 0, team2A: 0, financeA: 0, marketingA: 0, adminB: 0, outsider: 0 }) as (keyof typeof u)[]) {
    u[k] = await createUser(db, `${k}@example.com`);
  }
  // Setup as the database owner (like the service-role bootstrap script).
  orgA = (await one<{ id: string }>(`insert into organizations (name, slug) values ('Güfi', 'gufi') returning id`)).id;
  orgB = (await one<{ id: string }>(`insert into organizations (name, slug) values ('Other Agency', 'other') returning id`)).id;
  const roles: [string, string, string][] = [
    [orgA, u.adminA, "admin"], [orgA, u.pmA, "project_manager"], [orgA, u.teamA, "team"], [orgA, u.team2A, "team"],
    [orgA, u.financeA, "finance"], [orgA, u.marketingA, "marketing"], [orgB, u.adminB, "admin"],
  ];
  for (const [o, user, role] of roles) await db.query(`insert into memberships (organization_id, user_id, role) values ($1, $2, $3)`, [o, user, role]);

  clientA = (await one<{ id: string }>(`insert into clients (organization_id, name, domain) values ($1, 'Rawayana', 'rawayana.com') returning id`, [orgA])).id;
  clientA2 = (await one<{ id: string }>(`insert into clients (organization_id, name) values ($1, 'Unassigned Co') returning id`, [orgA])).id;
  clientB = (await one<{ id: string }>(`insert into clients (organization_id, name) values ($1, 'Secret Client') returning id`, [orgB])).id;
  projectA = (await one<{ id: string }>(`insert into projects (organization_id, client_id, name) values ($1, $2, 'Shopify build') returning id`, [orgA, clientA])).id;
  projectA2 = (await one<{ id: string }>(`insert into projects (organization_id, client_id, name) values ($1, $2, 'Other build') returning id`, [orgA, clientA2])).id;
  await db.query(`insert into project_members (organization_id, project_id, user_id) values ($1, $2, $3)`, [orgA, projectA, u.teamA]);
  await db.query(`insert into contacts (organization_id, client_id, full_name, email) values ($1, $2, 'Ana', 'ana@rawayana.com')`, [orgA, clientA]);
});

describe("anonymous visitors", () => {
  it("cannot read any table", async () => {
    await as(db, null, async () => {
      for (const t of ["organizations", "profiles", "memberships", "clients", "contacts", "projects", "project_members", "audit_logs"]) {
        await expect(db.query(`select * from ${t}`), t).rejects.toThrow(/permission denied/);
      }
    });
  });
});

describe("organization isolation", () => {
  it("a user with no membership sees nothing", async () => {
    await as(db, u.outsider, async () => {
      expect(await count(`select * from organizations`)).toBe(0);
      expect(await count(`select * from clients`)).toBe(0);
      expect(await count(`select * from projects`)).toBe(0);
      expect(await count(`select * from memberships`)).toBe(0);
    });
  });

  it("admins see only their own organization's records", async () => {
    await as(db, u.adminB, async () => {
      expect((await db.query<{ name: string }>(`select name from clients`)).rows.map((r) => r.name)).toEqual(["Secret Client"]);
      expect(await count(`select * from projects`)).toBe(0);
      expect(await count(`select * from organizations`)).toBe(1);
    });
    await as(db, u.adminA, async () => {
      expect(await count(`select * from clients`)).toBe(2);
      expect(await count(`select * from clients where id = $1`, [clientB])).toBe(0);
    });
  });

  it("cannot create records in another organization", async () => {
    await as(db, u.pmA, async () => {
      await expect(db.query(`insert into clients (organization_id, name) values ($1, 'Sneaky')`, [orgB])).rejects.toThrow(/row-level security/);
    });
  });

  it("cannot attach a project to another organization's client", async () => {
    await as(db, u.pmA, async () => {
      await expect(
        db.query(`insert into projects (organization_id, client_id, name) values ($1, $2, 'Cross-org')`, [orgA, clientB]),
      ).rejects.toThrow(/foreign key/);
    });
  });

  it("cannot move a record to another organization", async () => {
    await expect(db.query(`update clients set organization_id = $1 where id = $2`, [orgB, clientA])).rejects.toThrow(/cannot be changed/);
  });

  it("only sees teammates' profiles", async () => {
    await as(db, u.adminB, async () => {
      expect(await count(`select * from profiles`)).toBe(1);
    });
    await as(db, u.teamA, async () => {
      expect(await count(`select * from profiles`)).toBe(6);
    });
  });
});

describe("roles inside an organization", () => {
  it("team members see only projects (and clients) they're assigned to", async () => {
    await as(db, u.teamA, async () => {
      expect((await db.query<{ id: string }>(`select id from projects`)).rows.map((r) => r.id)).toEqual([projectA]);
      expect((await db.query<{ id: string }>(`select id from clients`)).rows.map((r) => r.id)).toEqual([clientA]);
      expect(await count(`select * from contacts`)).toBe(0);
    });
    await as(db, u.team2A, async () => {
      expect(await count(`select * from projects`)).toBe(0);
      expect(await count(`select * from clients`)).toBe(0);
    });
  });

  it("team members cannot create or edit clients and projects", async () => {
    await as(db, u.teamA, async () => {
      await expect(db.query(`insert into clients (organization_id, name) values ($1, 'Nope')`, [orgA])).rejects.toThrow(/row-level security/);
      await expect(db.query(`insert into projects (organization_id, client_id, name) values ($1, $2, 'Nope')`, [orgA, clientA])).rejects.toThrow(/row-level security/);
      const res = await db.query(`update projects set name = 'Renamed' where id = $1`, [projectA]);
      expect(res.affectedRows ?? 0).toBe(0);
    });
  });

  it("finance can read projects but not change them", async () => {
    await as(db, u.financeA, async () => {
      expect(await count(`select * from projects`)).toBe(2);
      const res = await db.query(`update projects set name = 'Renamed' where id = $1`, [projectA]);
      expect(res.affectedRows ?? 0).toBe(0);
    });
  });

  it("marketing can create clients but not projects", async () => {
    await as(db, u.marketingA, async () => {
      await db.query(`insert into clients (organization_id, name) values ($1, 'New Lead')`, [orgA]);
      await expect(db.query(`insert into projects (organization_id, client_id, name) values ($1, $2, 'Nope')`, [orgA, clientA])).rejects.toThrow(/row-level security/);
    });
  });

  it("project managers create projects and assign teammates", async () => {
    await as(db, u.pmA, async () => {
      const p = await one<{ id: string }>(`insert into projects (organization_id, client_id, name) values ($1, $2, 'Theme refresh') returning id`, [orgA, clientA]);
      await db.query(`insert into project_members (organization_id, project_id, user_id) values ($1, $2, $3)`, [orgA, p.id, u.team2A]);
      // Can't assign someone from another organization
      await expect(db.query(`insert into project_members (organization_id, project_id, user_id) values ($1, $2, $3)`, [orgA, p.id, u.adminB])).rejects.toThrow(/foreign key/);
    });
    await as(db, u.team2A, async () => {
      expect(await count(`select * from projects`)).toBe(1);
    });
  });

  it("nobody can fake who created a record", async () => {
    await as(db, u.pmA, async () => {
      await expect(db.query(`insert into clients (organization_id, name, created_by) values ($1, 'Spoof', $2)`, [orgA, u.adminA])).rejects.toThrow(/row-level security/);
    });
  });

  it("only admins delete clients, and not while they have projects", async () => {
    await as(db, u.pmA, async () => {
      const res = await db.query(`delete from clients where id = $1`, [clientA]);
      expect(res.affectedRows ?? 0).toBe(0);
    });
    await as(db, u.adminA, async () => {
      await expect(db.query(`delete from clients where id = $1`, [clientA])).rejects.toThrow(/foreign key/);
    });
  });

  it("members cannot change roles or memberships from the app", async () => {
    await as(db, u.pmA, async () => {
      await expect(db.query(`update memberships set role = 'admin' where user_id = $1`, [u.pmA])).rejects.toThrow(/permission denied/);
      await expect(db.query(`insert into memberships (organization_id, user_id, role) values ($1, $2, 'admin')`, [orgA, u.outsider])).rejects.toThrow(/permission denied/);
    });
  });

  it("users edit only their own profile, and never their email", async () => {
    await as(db, u.teamA, async () => {
      await db.query(`update profiles set full_name = 'Team A' where id = $1`, [u.teamA]);
      const res = await db.query(`update profiles set full_name = 'Hacked' where id = $1`, [u.adminA]);
      expect(res.affectedRows ?? 0).toBe(0);
      await expect(db.query(`update profiles set email = 'x@y.com' where id = $1`, [u.teamA])).rejects.toThrow(/permission denied/);
    });
  });

  it("only admins can change organization settings", async () => {
    await as(db, u.pmA, async () => {
      const res = await db.query(`update organizations set name = 'Hijacked' where id = $1`, [orgA]);
      expect(res.affectedRows ?? 0).toBe(0);
    });
    await as(db, u.adminA, async () => {
      await db.query(`update organizations set timezone = 'America/Puerto_Rico' where id = $1`, [orgA]);
      await expect(db.query(`update organizations set slug = 'renamed' where id = $1`, [orgA])).rejects.toThrow(/permission denied/);
    });
  });
});

describe("data integrity", () => {
  it("prevents duplicate companies by name (any case) and domain", async () => {
    await as(db, u.pmA, async () => {
      await expect(db.query(`insert into clients (organization_id, name) values ($1, '  rawayana ')`, [orgA])).rejects.toThrow(/duplicate key/);
      await expect(db.query(`insert into clients (organization_id, name, domain) values ($1, 'Rawayana Music', 'rawayana.com')`, [orgA])).rejects.toThrow(/duplicate key/);
    });
    // Same name in a different organization is fine.
    await as(db, u.adminB, async () => {
      await db.query(`insert into clients (organization_id, name) values ($1, 'Rawayana')`, [orgB]);
    });
  });

  it("rejects a due date before the start date", async () => {
    await as(db, u.pmA, async () => {
      await expect(
        db.query(`insert into projects (organization_id, client_id, name, start_date, due_date) values ($1, $2, 'Bad dates', '2026-12-10', '2026-12-01')`, [orgA, clientA]),
      ).rejects.toThrow(/check constraint/);
    });
  });

  it("creates a profile for every new auth user", async () => {
    const id = await createUser(db, "new@example.com");
    expect((await one<{ email: string }>(`select email from profiles where id = $1`, [id])).email).toBe("new@example.com");
  });
});

describe("audit log", () => {
  it("records who changed what, readable by admins only", async () => {
    await as(db, u.pmA, async () => {
      await db.query(`update clients set status = 'active' where id = $1`, [clientA]);
      expect(await count(`select * from audit_logs`)).toBe(0);
    });
    await as(db, u.adminA, async () => {
      const row = await one<{ actor_id: string; action: string; changes: Record<string, unknown> }>(
        `select actor_id, action, changes from audit_logs where entity = 'clients' and entity_id = $1 and action = 'update' order by id desc limit 1`,
        [clientA],
      );
      expect(row.actor_id).toBe(u.pmA);
      expect(row.changes).toEqual({ status: { from: "prospect", to: "active" } });
      await expect(db.query(`delete from audit_logs`)).rejects.toThrow(/permission denied/);
    });
    await as(db, u.adminB, async () => {
      expect(await count(`select * from audit_logs where organization_id = $1`, [orgA])).toBe(0);
    });
  });
});

describe("project completion", () => {
  it("stamps completed_at when a project is completed and clears it when reopened", async () => {
    await as(db, u.pmA, async () => {
      await db.query(`update projects set status = 'completed' where id = $1`, [projectA2]);
      const first = await one<{ completed_at: string | null }>(`select completed_at from projects where id = $1`, [projectA2]);
      expect(first.completed_at).not.toBeNull();
      await db.query(`update projects set name = 'Other build (done)', completed_at = null where id = $1`, [projectA2]);
      expect((await one<{ completed_at: string | null }>(`select completed_at from projects where id = $1`, [projectA2])).completed_at).toEqual(first.completed_at);
      await db.query(`update projects set status = 'active' where id = $1`, [projectA2]);
      expect((await one<{ completed_at: string | null }>(`select completed_at from projects where id = $1`, [projectA2])).completed_at).toBeNull();
    });
  });
});

describe("deleting an organization", () => {
  it("removes it and everything in it, including its audit log", async () => {
    const o = (await one<{ id: string }>(`insert into organizations (name, slug) values ('Temp', 'temp-org') returning id`)).id;
    const user = await createUser(db, "temp@example.com");
    await db.query(`insert into memberships (organization_id, user_id, role) values ($1, $2, 'admin')`, [o, user]);
    const c = (await one<{ id: string }>(`insert into clients (organization_id, name) values ($1, 'Temp client') returning id`, [o])).id;
    await db.query(`insert into contacts (organization_id, client_id, full_name) values ($1, $2, 'X')`, [o, c]);
    await db.query(`delete from clients where organization_id = $1`, [o]); // clients with projects are protected; none here
    await db.query(`delete from organizations where id = $1`, [o]);
    expect(await count(`select * from audit_logs where organization_id = $1`, [o])).toBe(0);
    expect(await count(`select * from memberships where organization_id = $1`, [o])).toBe(0);
  });
});

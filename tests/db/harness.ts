// In-memory Postgres (PGlite) with our real migrations applied on top of a Supabase stand-in.
// Lets us test RLS policies and constraints without Docker or a Supabase project.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(__dirname, "..", "..");

export async function createTestDb() {
  const db = new PGlite();
  await db.exec(readFileSync(join(ROOT, "supabase/tests/support/supabase-stub.sql"), "utf8"));
  const dir = join(ROOT, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

// Run `fn` as a signed-in user (role `authenticated`, auth.uid() = userId), like a request
// through the Supabase API with that user's JWT. Pass null for an anonymous visitor.
export async function as<T>(db: TestDb, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? "authenticated" : "anon"}`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [userId ? JSON.stringify({ sub: userId, role: "authenticated" }) : ""]);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

export async function createUser(db: TestDb, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
  return rows[0].id;
}

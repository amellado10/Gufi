// Roles live in public.memberships (one role per person per organization).
// This matrix mirrors the RLS policies in supabase/migrations: the UI uses it to hide what a
// person can't do, but the DATABASE is what actually enforces it.
import type { Enums } from "@/types/database";

export type Role = Enums<"org_role">;

export const ROLES: readonly Role[] = ["admin", "project_manager", "team", "finance", "marketing"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Founder / Admin",
  project_manager: "Project manager",
  team: "Design & development",
  finance: "Finance",
  marketing: "Marketing",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access to the workspace, settings and audit history.",
  project_manager: "Clients, contacts and every project; creates projects and assigns the team.",
  team: "Only the projects they're assigned to, and those projects' clients.",
  finance: "Reads clients, contacts and every project. Finance tools arrive in a later phase.",
  marketing: "Clients and contacts (leads). Marketing tools arrive in a later phase.",
};

const PERMISSIONS = {
  "clients:write": ["admin", "project_manager", "marketing"],
  "clients:delete": ["admin"],
  "contacts:read": ["admin", "project_manager", "finance", "marketing"],
  "contacts:write": ["admin", "project_manager", "marketing"],
  "projects:read-all": ["admin", "project_manager", "finance"],
  "projects:write": ["admin", "project_manager"],
  "projects:assign": ["admin", "project_manager"],
  "settings:manage": ["admin"],
  "audit:read": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

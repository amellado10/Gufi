import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can, isRole, type Permission, type Role } from "@/lib/roles";
import type { Tables } from "@/types/database";

// Data access layer for "who is this and what may they do".
// Every page and server action in (workspace)/ calls requireWorkspace() or requirePermission():
// layouts don't re-run on client navigation, so a layout check alone is not enough.

export const CURRENT_ORG_COOKIE = "gufi_org";

export type Workspace = {
  user: { id: string; email: string };
  profile: Pick<Tables<"profiles">, "full_name" | "email" | "avatar_url">;
  organization: Pick<Tables<"organizations">, "id" | "name" | "slug" | "default_currency" | "timezone" | "locale">;
  role: Role;
  organizations: { id: string; name: string; role: Role }[];
};

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub as string, email: (claims.email as string | undefined) ?? "" };
});

export const getWorkspace = cache(async (): Promise<Workspace | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();

  const [{ data: memberships, error }, { data: profile }] = await Promise.all([
    supabase
      .from("memberships")
      .select("role, organization:organizations(id, name, slug, default_currency, timezone, locale)")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase.from("profiles").select("full_name, email, avatar_url").eq("id", user.id).maybeSingle(),
  ]);
  if (error) throw new Error(`Could not load your workspace: ${error.message}`);

  const orgs = (memberships ?? []).filter((m) => m.organization && isRole(m.role));
  if (orgs.length === 0) return null;

  const preferred = (await cookies()).get(CURRENT_ORG_COOKIE)?.value;
  const current = orgs.find((m) => m.organization!.id === preferred) ?? orgs[0];

  return {
    user,
    profile: profile ?? { full_name: null, email: user.email, avatar_url: null },
    organization: current.organization!,
    role: current.role,
    organizations: orgs.map((m) => ({ id: m.organization!.id, name: m.organization!.name, role: m.role })),
  };
});

export async function requireWorkspace(): Promise<Workspace> {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const workspace = await getWorkspace();
  if (!workspace) redirect("/no-access");
  return workspace;
}

// For pages: send people without the permission to /no-access.
export async function requirePermission(permission: Permission): Promise<Workspace> {
  const workspace = await requireWorkspace();
  if (!can(workspace.role, permission)) redirect("/no-access?reason=permission");
  return workspace;
}

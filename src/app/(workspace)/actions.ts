"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CURRENT_ORG_COOKIE, requireWorkspace } from "@/lib/auth";

export async function switchOrganization(organizationId: string) {
  const ws = await requireWorkspace();
  // Only organizations you belong to (the list itself came through RLS).
  if (!ws.organizations.some((o) => o.id === organizationId)) return;
  (await cookies()).set(CURRENT_ORG_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}

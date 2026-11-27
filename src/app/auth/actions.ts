"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import type { FormState } from "@/components/ui/form";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");

export async function signInWithPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password.") }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values: { email: String(form.get("email") ?? "") } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message for unknown email and wrong password (don't reveal who has an account).
  if (error) return { message: "That email and password don't match an account.", values: { email: parsed.data.email } };
  redirect(safeNextPath(form.get("next")));
}

export async function sendSignInLink(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { errors: { email: [parsed.error.issues[0].message] }, values: { email: String(form.get("email") ?? "") } };

  const supabase = await createClient();
  const next = safeNextPath(form.get("next"));
  // shouldCreateUser: false → links only go to people who were invited. No public sign-up.
  await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  return { ok: true, message: "If that email belongs to a Güfi OS account, a sign-in link is on its way.", values: { email: parsed.data } };
}

export async function setPassword(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      password: z.string().min(12, "Use at least 12 characters.").max(128),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/sign-in");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

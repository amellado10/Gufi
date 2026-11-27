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

// Supabase refuses to send when its email quota is used up (the built-in sender allows only a few
// emails per hour). Say so: it's project-wide, so it reveals nothing about who has an account.
// Other errors (e.g. "no such user") keep the neutral answer so accounts can't be discovered.
function emailNotSent(error: { status?: number; code?: string; message?: string } | null): FormState | null {
  if (!error) return null;
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return { message: "Too many emails were sent in the last hour, so this one wasn't sent. Please try again later." };
  }
  if (error.code !== "otp_disabled" && error.code !== "user_not_found") console.error(`[auth] email not sent: ${error.code ?? error.status ?? "?"}`);
  return null;
}

export async function sendSignInLink(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { errors: { email: [parsed.error.issues[0].message] }, values: { email: String(form.get("email") ?? "") } };

  const supabase = await createClient();
  const next = safeNextPath(form.get("next"));
  // shouldCreateUser: false → links only go to people who were invited. No public sign-up.
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  const refused = emailNotSent(error);
  if (refused) return { ...refused, values: { email: parsed.data } };
  return { ok: true, message: "If that email belongs to a Güfi OS account, a sign-in link is on its way.", values: { email: parsed.data } };
}

export async function sendPasswordReset(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { errors: { email: [parsed.error.issues[0].message] }, values: { email: String(form.get("email") ?? "") } };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent("/auth/set-password")}`,
  });
  const refused = emailNotSent(error);
  if (refused) return { ...refused, values: { email: parsed.data } };
  // Same answer whether or not the account exists.
  return { ok: true, message: "If that email belongs to a Güfi OS account, a link to set your password is on its way.", values: { email: parsed.data } };
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

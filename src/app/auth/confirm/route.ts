import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

// Landing page for links in Supabase emails (invite, magic link, password recovery).
// Email templates must link to: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>
// (see docs/setup.md). The token is verified server-side and turned into a session cookie.
const TYPES: EmailOtpType[] = ["invite", "magiclink", "recovery", "email", "email_change"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // New invitees and password resets choose a password first.
      const to = type === "invite" || type === "recovery" ? "/auth/set-password" : next;
      return NextResponse.redirect(new URL(to, request.url));
    }
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", request.url));
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/logo";
import { getUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";
import { EmailLinkSession } from "./email-link-session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getUser()) redirect(next);
  const linkError = params.error === "link";

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      {/* gufi.io's pink edge glow, softened for a light surface */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 40%, transparent 35%, rgb(255 63 118 / 0.16) 85%)" }}
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Wordmark className="h-12" />
          <p className="text-sm font-medium text-muted-foreground">Güfi OS · internal workspace</p>
        </div>
        <div className="gufi-corner border border-border bg-card p-6 shadow-pop sm:p-8">
          <h1 className="text-xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Access is by invitation only.</p>
          {linkError && (
            <p role="alert" className="mt-4 rounded-md border border-status-critical/20 bg-status-critical/8 px-3 py-2 text-sm text-status-critical">
              That link is invalid or has expired. Request a new one below.
            </p>
          )}
          <EmailLinkSession next={next}>
            <SignInForm next={next} />
          </EmailLinkSession>
        </div>
      </div>
    </main>
  );
}

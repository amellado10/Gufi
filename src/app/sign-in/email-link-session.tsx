"use client";

// Supabase's default invite / magic-link emails send people back with the session in the URL
// fragment (#access_token=…&refresh_token=…&type=invite). The fragment never reaches the server,
// so we finish sign-in here: store the session in cookies, then continue. Invitations and
// password recoveries go to "choose a password".
import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safe-redirect";

const noSubscribe = () => () => {};
const hashHasTokens = () => window.location.hash.includes("access_token=");

export function EmailLinkSession({ next, children }: { next: string; children: React.ReactNode }) {
  // false on the server and during hydration; true in the browser when the URL carries tokens.
  const hasTokens = useSyncExternalStore(noSubscribe, hashHasTokens, () => false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!window.location.hash.includes("access_token=")) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token") ?? "";
    const refresh_token = params.get("refresh_token") ?? "";
    const type = params.get("type");

    const finish = async () => {
      if (!access_token || !refresh_token) throw new Error("incomplete link");
      const { error } = await createClient().auth.setSession({ access_token, refresh_token });
      if (error) throw error;
      window.location.replace(type === "invite" || type === "recovery" ? "/auth/set-password" : safeNextPath(next));
    };
    finish().catch(() => {
      // Remove the tokens from the address bar and history, then show the form with an error.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setFailed(true);
    });
  }, [next]);

  if (hasTokens && !failed) {
    return (
      <p role="status" className="mt-6 text-sm text-muted-foreground">
        Signing you in…
      </p>
    );
  }
  return (
    <>
      {failed && (
        <p role="alert" className="mt-4 rounded-md border border-status-critical/20 bg-status-critical/8 px-3 py-2 text-sm text-status-critical">
          That link is invalid or has expired. Request a new one below.
        </p>
      )}
      {children}
    </>
  );
}

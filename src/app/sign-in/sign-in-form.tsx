"use client";

import { useActionState, useState } from "react";
import { sendPasswordReset, sendSignInLink, signInWithPassword } from "@/app/auth/actions";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage, TextField } from "@/components/ui/form";

type Mode = "password" | "link" | "reset";

const SUBMIT: Record<Mode, [string, string]> = {
  password: ["Sign in", "Signing in…"],
  link: ["Email me a sign-in link", "Sending…"],
  reset: ["Email me a link to set my password", "Sending…"],
};

export function SignInForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("password");
  const [pwState, pwAction] = useActionState(signInWithPassword, undefined);
  const [linkState, linkAction] = useActionState(sendSignInLink, undefined);
  const [resetState, resetAction] = useActionState(sendPasswordReset, undefined);
  const state = { password: pwState, link: linkState, reset: resetState }[mode];
  const action = { password: pwAction, link: linkAction, reset: resetAction }[mode];
  const link = "text-sm font-medium text-link hover:text-link-hover hover:underline";

  return (
    <div className="mt-6">
      {mode === "reset" && (
        <p className="mb-4 text-sm text-muted-foreground">New here, or forgot your password? We&apos;ll email you a link to set one.</p>
      )}
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormMessage state={state} />
        <TextField label="Work email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} error={state?.errors?.email} />
        {mode === "password" && (
          <TextField label="Password" name="password" type="password" autoComplete="current-password" required error={pwState?.errors?.password} />
        )}
        <SubmitButton className="w-full" pendingLabel={SUBMIT[mode][1]}>
          {SUBMIT[mode][0]}
        </SubmitButton>
      </form>
      <div className="mt-4 flex flex-col items-center gap-2">
        {mode !== "password" && (
          <button type="button" onClick={() => setMode("password")} className={link}>
            Sign in with my password
          </button>
        )}
        {mode !== "link" && (
          <button type="button" onClick={() => setMode("link")} className={link}>
            Email me a sign-in link instead
          </button>
        )}
        {mode !== "reset" && (
          <button type="button" onClick={() => setMode("reset")} className={link}>
            Forgot or never set a password?
          </button>
        )}
      </div>
    </div>
  );
}

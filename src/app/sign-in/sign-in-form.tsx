"use client";

import { useActionState, useState } from "react";
import { sendSignInLink, signInWithPassword } from "@/app/auth/actions";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage, TextField } from "@/components/ui/form";

export function SignInForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [pwState, pwAction] = useActionState(signInWithPassword, undefined);
  const [linkState, linkAction] = useActionState(sendSignInLink, undefined);
  const state = mode === "password" ? pwState : linkState;

  return (
    <div className="mt-6">
      <form action={mode === "password" ? pwAction : linkAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <FormMessage state={state} />
        <TextField
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.values?.email}
          error={state?.errors?.email}
        />
        {mode === "password" && (
          <TextField label="Password" name="password" type="password" autoComplete="current-password" required error={pwState?.errors?.password} />
        )}
        <SubmitButton className="w-full" pendingLabel={mode === "password" ? "Signing in…" : "Sending…"}>
          {mode === "password" ? "Sign in" : "Email me a sign-in link"}
        </SubmitButton>
      </form>
      <button
        type="button"
        onClick={() => setMode(mode === "password" ? "link" : "password")}
        className="mt-4 w-full text-center text-sm font-medium text-link hover:text-link-hover hover:underline"
      >
        {mode === "password" ? "Email me a sign-in link instead" : "Use my password instead"}
      </button>
    </div>
  );
}

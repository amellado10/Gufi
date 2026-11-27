"use client";

import { useActionState } from "react";
import { setPassword } from "@/app/auth/actions";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage, TextField } from "@/components/ui/form";

export function SetPasswordForm() {
  const [state, action] = useActionState(setPassword, undefined);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <FormMessage state={state} />
      <TextField label="New password" name="password" type="password" autoComplete="new-password" required minLength={12} error={state?.errors?.password} />
      <TextField label="Confirm password" name="confirm" type="password" autoComplete="new-password" required error={state?.errors?.confirm} />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Save and continue
      </SubmitButton>
    </form>
  );
}

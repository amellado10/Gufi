"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage, TextField, type FormState } from "@/components/ui/form";

export function ContactForm({
  action,
  defaults,
  submitLabel = "Add contact",
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  defaults?: Record<string, string | null>;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && !defaults) form.current?.reset();
  }, [state, defaults]);
  const e = state?.errors ?? {};
  const v = (k: string) => (state?.ok && !defaults ? "" : (state?.values?.[k] ?? defaults?.[k] ?? ""));
  return (
    <form ref={form} action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="full_name" required defaultValue={v("full_name")} error={e.full_name} />
        <TextField label="Role / title" name="title" defaultValue={v("title")} error={e.title} placeholder="Founder, marketing lead…" />
        <TextField label="Email" name="email" type="email" defaultValue={v("email")} error={e.email} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={v("phone")} error={e.phone} />
      </div>
      <SubmitButton variant={defaults ? "primary" : "secondary"} size={defaults ? "md" : "sm"} pendingLabel="Saving…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

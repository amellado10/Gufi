"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage, TextField, type FormState } from "@/components/ui/form";

export function ContactForm({ action }: { action: (prev: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  const e = state?.errors ?? {};
  const v = (k: string) => (state?.ok ? "" : (state?.values?.[k] ?? ""));
  return (
    <form ref={form} action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="full_name" required defaultValue={v("full_name")} error={e.full_name} />
        <TextField label="Role / title" name="title" defaultValue={v("title")} error={e.title} placeholder="Founder, marketing lead…" />
        <TextField label="Email" name="email" type="email" defaultValue={v("email")} error={e.email} />
        <TextField label="Phone" name="phone" type="tel" defaultValue={v("phone")} error={e.phone} />
      </div>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Adding…">
        Add contact
      </SubmitButton>
    </form>
  );
}

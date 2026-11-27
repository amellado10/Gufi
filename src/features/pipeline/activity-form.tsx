"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, type FormState } from "@/components/ui/form";

export function ActivityForm({ action }: { action: (prev: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={formAction} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <SelectField
          label="Type"
          name="kind"
          defaultValue="note"
          options={[
            { value: "note", label: "Note" },
            { value: "call", label: "Call" },
            { value: "email", label: "Email" },
            { value: "meeting", label: "Meeting" },
          ]}
        />
        <TextArea label="What happened" name="body" required rows={2} error={state?.errors?.body} defaultValue={state?.ok ? "" : state?.values?.body} />
      </div>
      <SubmitButton variant="secondary" size="sm" pendingLabel="Adding…">
        Add to timeline
      </SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage, SelectField, type FormState } from "@/components/ui/form";

export function AssignForm({ action, options }: { action: (prev: FormState, form: FormData) => Promise<FormState>; options: { value: string; label: string }[] }) {
  const [state, formAction] = useActionState(action, undefined);
  if (options.length === 0) return <p className="text-xs text-muted-foreground">Everyone in the workspace is already on this project.</p>;
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <FormMessage state={state} />
      <SelectField label="Add a teammate" name="user_id" options={options} placeholder="Choose a person" error={state?.errors?.user_id} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Adding…">
        Add to project
      </SubmitButton>
    </form>
  );
}

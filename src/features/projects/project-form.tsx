"use client";

import { useActionState } from "react";
import { ButtonLink, SubmitButton } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField, type FormState } from "@/components/ui/form";
import { PROJECT_STATUS, PROJECT_STATUSES } from "./status";

type Option = { value: string; label: string };
type Defaults = Partial<Record<"client_id" | "name" | "description" | "status" | "owner_id" | "start_date" | "due_date", string | null>>;

export function ProjectForm({
  action,
  defaults = {},
  clients,
  owners,
  cancelHref,
  submitLabel,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  defaults?: Defaults;
  clients: Option[];
  owners: Option[];
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const v = (k: keyof Defaults) => state?.values?.[k] ?? defaults[k] ?? "";
  const e = state?.errors ?? {};
  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Project name" name="name" required defaultValue={v("name")} error={e.name} autoFocus placeholder="Shopify Plus migration" />
        <SelectField label="Client" name="client_id" required defaultValue={v("client_id")} error={e.client_id} options={clients} placeholder="Choose a client" />
        <SelectField
          label="Status"
          name="status"
          defaultValue={v("status") || "planning"}
          error={e.status}
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: PROJECT_STATUS[s].label }))}
        />
        <SelectField label="Project owner" name="owner_id" defaultValue={v("owner_id")} error={e.owner_id} options={owners} placeholder="No owner yet" hint="The owner is added to the project team." />
        <TextField label="Start date" name="start_date" type="date" defaultValue={v("start_date")} error={e.start_date} />
        <TextField label="Due date" name="due_date" type="date" defaultValue={v("due_date")} error={e.due_date} />
      </div>
      <TextArea label="Description" name="description" defaultValue={v("description")} error={e.description} hint="Goals and scope in a few lines. Proposals and budgets arrive in a later phase." />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

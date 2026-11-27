"use client";

import { useActionState } from "react";
import { SubmitButton, ButtonLink } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField, type FormState } from "@/components/ui/form";
import { CLIENT_STATUS, CLIENT_STATUSES } from "./status";

type Defaults = { name?: string; legal_name?: string | null; website?: string | null; industry?: string | null; status?: string; owner_id?: string | null; notes?: string | null };

export function ClientForm({
  action,
  defaults = {},
  owners,
  cancelHref,
  submitLabel,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  defaults?: Defaults;
  owners: { value: string; label: string }[];
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
        <TextField label="Client name" name="name" required defaultValue={v("name")} error={e.name} autoFocus />
        <TextField label="Legal name" name="legal_name" defaultValue={v("legal_name")} error={e.legal_name} hint="If different from the name people use." />
        <TextField label="Website" name="website" defaultValue={v("website")} error={e.website} placeholder="example.com" hint="Used to spot duplicate companies." />
        <TextField label="Industry" name="industry" defaultValue={v("industry")} error={e.industry} placeholder="Beauty, food & beverage…" />
        <SelectField
          label="Status"
          name="status"
          defaultValue={v("status") || "prospect"}
          error={e.status}
          options={CLIENT_STATUSES.map((s) => ({ value: s, label: CLIENT_STATUS[s].label }))}
        />
        <SelectField label="Account owner" name="owner_id" defaultValue={v("owner_id")} error={e.owner_id} options={owners} placeholder="No owner yet" />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={v("notes")} error={e.notes} hint="Internal only. Never shown to the client." />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

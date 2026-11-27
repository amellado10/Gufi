"use client";

import { useActionState, useState } from "react";
import { ButtonLink, SubmitButton } from "@/components/ui/button";
import { FormMessage, SelectField, TextField } from "@/components/ui/form";
import { createProposalAction } from "./actions";

export function NewProposalForm({
  clients,
  deals,
  defaults,
}: {
  clients: { value: string; label: string }[];
  deals: { value: string; label: string; clientId: string }[];
  defaults: { client_id: string; opportunity_id: string; title: string };
}) {
  const [state, action] = useActionState(createProposalAction, undefined);
  const [clientId, setClientId] = useState(state?.values?.client_id ?? defaults.client_id);
  const clientDeals = deals.filter((d) => d.clientId === clientId);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <TextField label="Title" name="title" required defaultValue={state?.values?.title ?? defaults.title} error={e.title} autoFocus hint="Shown on the cover, e.g. “Rediseño de tienda Shopify”." />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField label="Client" name="client_id" required value={clientId} onChange={(ev) => setClientId(ev.target.value)} error={e.client_id} options={clients} placeholder="Choose a client" />
        <SelectField
          label="Deal"
          name="opportunity_id"
          defaultValue={state?.values?.opportunity_id ?? defaults.opportunity_id}
          error={e.opportunity_id}
          options={clientDeals.map((d) => ({ value: d.value, label: d.label }))}
          placeholder={clientDeals.length ? "No deal" : "No open deals for this client"}
          hint="Sending moves the deal to “Proposal sent”; acceptance wins it."
        />
        <SelectField
          label="Language"
          name="language"
          defaultValue={state?.values?.language ?? "es"}
          options={[
            { value: "es", label: "Español" },
            { value: "en", label: "English" },
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Creating…">Create draft</SubmitButton>
        <ButtonLink href="/proposals" variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

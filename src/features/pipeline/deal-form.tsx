"use client";

import { useActionState, useState } from "react";
import { ButtonLink, SubmitButton } from "@/components/ui/button";
import { FormMessage, SelectField, TextArea, TextField, type FormState } from "@/components/ui/form";
import { LEAD_SOURCES } from "./model";

type Option = { value: string; label: string };

const NEW_CLIENT = "__new__";

export function DealForm({
  action,
  defaults = {},
  clients,
  contacts,
  stages,
  owners,
  partners,
  cancelHref,
  submitLabel,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  defaults?: Record<string, string | null | undefined>;
  clients: Option[];
  contacts: { value: string; label: string; clientId: string }[];
  stages: (Option & { kind: string })[];
  owners: Option[];
  partners: Option[];
  cancelHref: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const v = (k: string) => state?.values?.[k] ?? defaults[k] ?? "";
  const e = state?.errors ?? {};
  const [clientId, setClientId] = useState(v("client_id"));
  const [newClient, setNewClient] = useState(!v("client_id") && Boolean(v("new_client_name")));
  const [stageId, setStageId] = useState(v("stage_id") || stages[0]?.value || "");
  const isLost = stages.find((s) => s.value === stageId)?.kind === "lost";
  const clientContacts = contacts.filter((c) => c.clientId === clientId);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Deal" name="title" required defaultValue={v("title")} error={e.title} autoFocus placeholder="Shopify store redesign" />
        <div>
          {newClient ? (
            <TextField label="New company" name="new_client_name" required defaultValue={v("new_client_name")} error={e.client_id} hint="Added to Clients as a prospect." />
          ) : (
            <SelectField
              label="Client"
              name="client_id"
              required
              value={clientId}
              onChange={(ev) => {
                if (ev.target.value === NEW_CLIENT) {
                  setNewClient(true);
                  setClientId("");
                } else setClientId(ev.target.value);
              }}
              error={e.client_id}
              options={[...clients, { value: NEW_CLIENT, label: "+ New client" }]}
              placeholder="Choose a client"
            />
          )}
          {newClient && (
            <button type="button" onClick={() => setNewClient(false)} className="mt-1 text-xs font-medium text-link hover:underline">
              Choose an existing client instead
            </button>
          )}
        </div>
        <TextField label="Estimated value (USD, before ITBMS)" name="value" inputMode="decimal" defaultValue={v("value")} error={e.value} placeholder="2,500" />
        <SelectField label="Stage" name="stage_id" value={stageId} onChange={(ev) => setStageId(ev.target.value)} error={e.stage_id} options={stages} />
        {isLost && (
          <TextArea label="Why was it lost?" name="lost_reason" required defaultValue={v("lost_reason")} error={e.lost_reason} rows={2} className="sm:col-span-2" />
        )}
        <SelectField label="Owner" name="owner_id" defaultValue={v("owner_id")} error={e.owner_id} options={owners} placeholder="No owner" />
        {!newClient && clientContacts.length > 0 && (
          <SelectField
            label="Contact"
            name="contact_id"
            defaultValue={v("contact_id")}
            error={e.contact_id}
            options={clientContacts.map((c) => ({ value: c.value, label: c.label }))}
            placeholder="No contact"
          />
        )}
        <SelectField label="Source" name="source" defaultValue={v("source") || "other"} error={e.source} options={LEAD_SOURCES} />
        <TextField label="Source detail" name="source_detail" defaultValue={v("source_detail")} error={e.source_detail} placeholder="Who referred them, which campaign…" />
        <SelectField
          label="Brought in by"
          name="brought_by"
          defaultValue={v("brought_by")}
          error={e.brought_by}
          options={[
            { value: "gufi", label: "Güfi (paid media, website, inbound…)" },
            { value: "none", label: "None" },
            ...partners.map((p) => ({ value: `partner:${p.value}`, label: p.label })),
          ]}
          placeholder="Not set"
          hint="A partner gets the 15% in the split; with Güfi or None it stays with Güfi."
        />
        <TextField label="Next follow-up" name="next_follow_up_on" type="date" defaultValue={v("next_follow_up_on")} error={e.next_follow_up_on} />
        <TextField label="Expected close" name="expected_close_on" type="date" defaultValue={v("expected_close_on")} error={e.expected_close_on} />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={v("notes")} error={e.notes} hint="What they need, budget signals, decision makers. Internal only." />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}

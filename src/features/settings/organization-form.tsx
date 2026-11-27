"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/button";
import { FormMessage, SelectField, TextField } from "@/components/ui/form";
import { updateOrganizationAction } from "./actions";

export function OrganizationForm({
  defaults,
  timezones,
}: {
  defaults: { name: string; timezone: string; default_currency: string; locale: string };
  timezones: string[];
}) {
  const [state, action] = useActionState(updateOrganizationAction, undefined);
  const v = (k: keyof typeof defaults) => state?.values?.[k] ?? defaults[k];
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Workspace name" name="name" required defaultValue={v("name")} error={e.name} />
        <SelectField
          label="Time zone"
          name="timezone"
          defaultValue={v("timezone")}
          error={e.timezone}
          options={timezones.map((tz) => ({ value: tz, label: tz.replaceAll("_", " ") }))}
          hint="Dates, due dates and 'today' use this time zone."
        />
        <TextField label="Default currency" name="default_currency" defaultValue={v("default_currency")} error={e.default_currency} maxLength={3} hint="ISO code, e.g. USD. Used by invoices later." />
        <SelectField
          label="Language"
          name="locale"
          defaultValue={v("locale")}
          error={e.locale}
          options={[
            { value: "en", label: "English" },
            { value: "es", label: "Español (coming later)" },
          ]}
        />
      </div>
      <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  );
}

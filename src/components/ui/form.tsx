"use client";


// Accessible form primitives: every control has a visible label, hints and errors are linked
// with aria-describedby, and invalid fields are announced.
import { useId } from "react";

export type FieldErrors = Partial<Record<string, string[] | undefined>>;
export type FormState = { ok?: boolean; message?: string; errors?: FieldErrors; values?: Record<string, string> } | undefined;

const control =
  "w-full rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground/80 aria-[invalid=true]:border-status-critical focus-visible:border-brand";

type FieldProps = { label: string; name: string; error?: string[]; hint?: string; required?: boolean; className?: string };

function FieldShell({ label, error, hint, required, className = "", id, children }: Omit<FieldProps, "name"> & { id: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">
        {label}
        {required ? <span className="text-muted-foreground"> (required)</span> : null}
      </label>
      {children}
      {hint && !error?.length && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error?.length ? (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-status-critical">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string[], hint?: string) {
  return error?.length ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function TextField({ label, name, error, hint, required, className, ...input }: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell {...{ label, error, hint, required, className, id }}>
      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={error?.length ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${control} h-10`}
        {...input}
      />
    </FieldShell>
  );
}

export function TextArea({ label, name, error, hint, required, className, ...input }: FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell {...{ label, error, hint, required, className, id }}>
      <textarea
        id={id}
        name={name}
        required={required}
        rows={4}
        aria-invalid={error?.length ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${control} py-2`}
        {...input}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  required,
  className,
  options,
  placeholder,
  ...select
}: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const id = useId();
  return (
    <FieldShell {...{ label, error, hint, required, className, id }}>
      <select
        id={id}
        name={name}
        required={required}
        aria-invalid={error?.length ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${control} h-10`}
        {...select}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-md border px-3 py-2 text-sm ${
        state.ok ? "border-status-good/20 bg-status-good/8 text-status-good" : "border-status-critical/20 bg-status-critical/8 text-status-critical"
      }`}
    >
      {state.message}
    </p>
  );
}

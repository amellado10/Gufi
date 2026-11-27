import { z } from "zod";
import { CLIENT_STATUSES } from "./status";

// "https://www.Example.com/shop?x" → { website: "https://www.example.com/shop", domain: "example.com" }
export function normalizeWebsite(input: string | null | undefined): { website: string | null; domain: string | null } | { error: string } {
  const raw = (input ?? "").trim();
  if (!raw) return { website: null, domain: null };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { error: "Enter a valid website, like example.com." };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { error: "Enter a valid website, like example.com." };
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return { website: `${url.protocol}//${url.hostname.toLowerCase()}${path}`, domain: host };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => v || null)
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const optionalUuid = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable())
  .optional()
  .transform((v) => v ?? null);

export const clientInput = z.object({
  name: z.string().trim().min(1, "Give the client a name.").max(200),
  legal_name: optionalText(200),
  website: optionalText(300),
  industry: optionalText(120),
  status: z.enum(CLIENT_STATUSES as [string, ...string[]]).default("prospect"),
  owner_id: optionalUuid,
  notes: optionalText(10000),
});

export const contactInput = z.object({
  full_name: z.string().trim().min(1, "Add the contact's name.").max(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v || null)
    .pipe(z.email("Enter a valid email address.").nullable())
    .optional()
    .transform((v) => v ?? null),
  phone: optionalText(40),
  title: optionalText(120),
});

export { optionalText, optionalUuid };

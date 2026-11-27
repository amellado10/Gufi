import { z } from "zod";
import { optionalText, optionalUuid } from "@/features/clients/schema";
import { PROJECT_STATUSES } from "./status";

const optionalDate = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.iso.date("Use a valid date.").nullable())
  .optional()
  .transform((v) => v ?? null);

export const projectInput = z
  .object({
    client_id: z.uuid("Choose a client."),
    name: z.string().trim().min(1, "Give the project a name.").max(200),
    description: optionalText(10000),
    status: z.enum(PROJECT_STATUSES as [string, ...string[]]).default("planning"),
    owner_id: optionalUuid,
    start_date: optionalDate,
    due_date: optionalDate,
  })
  .refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, {
    path: ["due_date"],
    message: "The due date can't be before the start date.",
  });

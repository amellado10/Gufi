import { CircleCheck, CircleDashed, CirclePause, type LucideIcon } from "lucide-react";
import type { Enums } from "@/types/database";
import type { Tone } from "@/components/ui/badge";

export type ClientStatus = Enums<"client_status">;
export const CLIENT_STATUSES: ClientStatus[] = ["prospect", "active", "inactive"];
export const CLIENT_STATUS: Record<ClientStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  prospect: { label: "Prospect", tone: "info", icon: CircleDashed },
  active: { label: "Active", tone: "good", icon: CircleCheck },
  inactive: { label: "Inactive", tone: "neutral", icon: CirclePause },
};

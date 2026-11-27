import { CircleCheck, CircleDashed, CircleDot, CirclePause, CircleX, type LucideIcon } from "lucide-react";
import type { Enums } from "@/types/database";
import type { Tone } from "@/components/ui/badge";

export type ProjectStatus = Enums<"project_status">;
export const PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "on_hold", "completed", "cancelled"];
export const OPEN_PROJECT_STATUSES: ProjectStatus[] = ["planning", "active", "on_hold"];
export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  planning: { label: "Planning", tone: "info", icon: CircleDashed },
  active: { label: "In progress", tone: "good", icon: CircleDot },
  on_hold: { label: "On hold", tone: "warning", icon: CirclePause },
  completed: { label: "Completed", tone: "neutral", icon: CircleCheck },
  cancelled: { label: "Cancelled", tone: "neutral", icon: CircleX },
};

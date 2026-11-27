// Display formatting. Dates are stored as UTC timestamps or plain calendar dates
// ("2026-11-27"); they are shown in the organization's time zone.

// Today's calendar date in a time zone, as "YYYY-MM-DD".
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-11-27" → "Nov 27" (adds the year when it isn't `today`'s year)
export function formatDay(day: string | null | undefined, today?: string): string {
  if (!day) return "—";
  const d = new Date(`${day}T12:00:00Z`);
  const sameYear = today ? today.slice(0, 4) === day.slice(0, 4) : false;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

// "Thursday, November 27"
export function longDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

// A moment in the organization's time zone: "Nov 27, 9:15 AM"
export function formatMoment(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Whole days from `from` to `to` (calendar dates). Negative when `to` is earlier.
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function initials(name: string | null | undefined, email?: string): string {
  const source = (name ?? "").trim() || (email ?? "").split("@")[0];
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function personName(p: { full_name: string | null; email: string } | null | undefined): string {
  if (!p) return "—";
  return p.full_name?.trim() || p.email;
}

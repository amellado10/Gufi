import { describe, expect, it } from "vitest";
import { normalizeWebsite } from "@/features/clients/schema";
import { projectInput } from "@/features/projects/schema";
import { safeNextPath } from "@/lib/safe-redirect";
import { formatMoney, sumCents } from "@/lib/money";
import { addDays, daysBetween, formatDay, initials, todayIn } from "@/lib/format";
import { can, ROLES } from "@/lib/roles";

describe("normalizeWebsite", () => {
  it("normalizes to an https URL and a bare domain", () => {
    expect(normalizeWebsite("www.Rawayana.com/")).toEqual({ website: "https://www.rawayana.com", domain: "rawayana.com" });
    expect(normalizeWebsite("http://shop.example.co/store/")).toEqual({ website: "http://shop.example.co/store", domain: "shop.example.co" });
    expect(normalizeWebsite("")).toEqual({ website: null, domain: null });
  });
  it("rejects things that aren't websites", () => {
    expect(normalizeWebsite("not a site")).toHaveProperty("error");
    expect(normalizeWebsite("localhost")).toHaveProperty("error");
  });
  it("never produces a javascript: link", () => {
    const r = normalizeWebsite("javascript:alert(1)");
    expect("website" in r ? r.website : "").not.toMatch(/^javascript:/i);
  });
});

describe("safeNextPath", () => {
  it("keeps in-app paths", () => {
    expect(safeNextPath("/clients?status=active")).toBe("/clients?status=active");
  });
  it("blocks redirects to other sites", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "/ok\nLocation: x", null, 42]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});

describe("money", () => {
  it("formats integer cents exactly", () => {
    expect(formatMoney({ cents: 123456789, currency: "USD" })).toBe("$1,234,567.89");
    expect(formatMoney({ cents: -5, currency: "USD" })).toBe("-$0.05");
    expect(formatMoney({ cents: BigInt("900719925474099199"), currency: "USD" })).toBe("$9,007,199,254,740,991.99");
  });
  it("refuses to add different currencies", () => {
    expect(sumCents([{ cents: 100, currency: "USD" }, { cents: 250, currency: "USD" }])).toEqual({ cents: BigInt(350), currency: "USD" });
    expect(() => sumCents([{ cents: 100, currency: "USD" }, { cents: 100, currency: "EUR" }])).toThrow(/different currencies/);
  });
});

describe("dates", () => {
  it("computes today in the organization's time zone", () => {
    // 2026-11-28 02:00 UTC is still Nov 27 in Puerto Rico (UTC-4)
    expect(todayIn("America/Puerto_Rico", new Date("2026-11-28T02:00:00Z"))).toBe("2026-11-27");
    expect(todayIn("UTC", new Date("2026-11-28T02:00:00Z"))).toBe("2026-11-28");
  });
  it("does calendar math without time-zone drift", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(daysBetween("2026-11-27", "2026-11-20")).toBe(-7);
    expect(formatDay("2026-11-27", "2026-01-01")).toBe("Nov 27");
    expect(formatDay("2027-01-02", "2026-01-01")).toBe("Jan 2, 2027");
  });
  it("makes initials", () => {
    expect(initials("Ana María López")).toBe("AM");
    expect(initials(null, "dev.team@gufi.io")).toBe("DT");
  });
});

describe("project input", () => {
  it("rejects a due date before the start date", () => {
    const r = projectInput.safeParse({ client_id: crypto.randomUUID(), name: "X", start_date: "2026-12-10", due_date: "2026-12-01" });
    expect(r.success).toBe(false);
  });
  it("turns empty optional fields into null", () => {
    const r = projectInput.parse({ client_id: crypto.randomUUID(), name: " Build ", owner_id: "", start_date: "", description: "" });
    expect(r).toMatchObject({ name: "Build", owner_id: null, start_date: null, description: null, status: "planning" });
  });
});

describe("role matrix (mirrors RLS)", () => {
  it("only admins manage settings", () => {
    expect(ROLES.filter((r) => can(r, "settings:manage"))).toEqual(["admin"]);
  });
  it("the delivery team can't write clients or projects", () => {
    expect(can("team", "clients:write")).toBe(false);
    expect(can("team", "projects:write")).toBe(false);
    expect(can("team", "contacts:read")).toBe(false);
  });
});

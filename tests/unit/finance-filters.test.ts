import { describe, expect, it } from "vitest";
import { isFullPeriod, matchesProject, parseFinanceFilters } from "@/features/finance/filters";

const months = Array.from({ length: 11 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
const id = "6b0f3a52-7c1e-4a8e-9d55-2f6b1c3e9a10";

describe("finance filters", () => {
  it("defaults to the whole year and everything", () => {
    const f = parseFinanceFilters({}, months);
    expect(f).toEqual({ period: "ytd", from: "2026-01", to: "2026-11", client: null, status: "all", partner: null });
    expect(isFullPeriod(f, months)).toBe(true);
  });

  it("maps presets to month ranges", () => {
    expect(parseFinanceFilters({ period: "q3" }, months)).toMatchObject({ from: "2026-07", to: "2026-09" });
    expect(parseFinanceFilters({ period: "q4" }, months)).toMatchObject({ from: "2026-10", to: "2026-12" });
    expect(parseFinanceFilters({ period: "last3" }, months)).toMatchObject({ from: "2026-09", to: "2026-11" });
  });

  it("accepts a custom range and fixes a reversed one", () => {
    expect(parseFinanceFilters({ period: "custom", from: "2026-09", to: "2026-05" }, months)).toMatchObject({ from: "2026-05", to: "2026-09" });
  });

  it("ignores junk in the URL", () => {
    const f = parseFinanceFilters({ period: "nope", client: "'; drop table", status: "x", partner: "1", from: "2026-13" }, months);
    expect(f).toMatchObject({ period: "ytd", client: null, status: "all", partner: null });
  });

  it("matches projects by client, partner and status", () => {
    const p = { clientId: id, status: "completed", outstandingCents: 197950, partnerIds: ["a", "b"] };
    const f = parseFinanceFilters({}, months);
    expect(matchesProject(p, f)).toBe(true);
    expect(matchesProject(p, { ...f, status: "balance" })).toBe(true);
    expect(matchesProject({ ...p, outstandingCents: 0 }, { ...f, status: "balance" })).toBe(false);
    expect(matchesProject(p, { ...f, status: "active" })).toBe(false);
    expect(matchesProject(p, { ...f, client: "other" })).toBe(false);
    expect(matchesProject(p, { ...f, partner: "b" })).toBe(true);
    expect(matchesProject(p, { ...f, partner: "c" })).toBe(false);
  });
});

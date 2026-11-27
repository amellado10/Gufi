import { describe, expect, it } from "vitest";
import { dealInput, followUpState, parseMoneyToCents, weightedValue } from "@/features/pipeline/model";

describe("parseMoneyToCents", () => {
  it("reads common ways of typing an amount", () => {
    expect(parseMoneyToCents("2500")).toBe(250000);
    expect(parseMoneyToCents("$2,500.5")).toBe(250050);
    expect(parseMoneyToCents("1,850.00")).toBe(185000);
    expect(parseMoneyToCents("")).toBeNull();
  });
  it("rejects what isn't an amount", () => {
    for (const bad of ["-5", "1.234", "abc", "1e5", "12,34,5.6.7"]) expect(parseMoneyToCents(bad)).toBe("invalid");
  });
});

describe("weightedValue", () => {
  it("weights open deals by stage probability and ignores closed ones", () => {
    expect(
      weightedValue([
        { value_cents: 500000, probability_bps: 2500, kind: "open" }, // 1,250.00
        { value_cents: 185000, probability_bps: 5000, kind: "open" }, // 925.00
        { value_cents: 999999, probability_bps: 10000, kind: "won" },
        { value_cents: null, probability_bps: 7500, kind: "open" },
      ]),
    ).toBe(217500);
  });
  it("rounds half-up to the cent", () => {
    expect(weightedValue([{ value_cents: 1, probability_bps: 5000, kind: "open" }])).toBe(1);
  });
});

describe("followUpState", () => {
  it("classifies follow-up dates", () => {
    expect(followUpState(null, "2026-11-27")).toBe("none");
    expect(followUpState("2026-11-20", "2026-11-27")).toBe("overdue");
    expect(followUpState("2026-11-27", "2026-11-27")).toBe("today");
    expect(followUpState("2026-11-29", "2026-11-27")).toBe("soon");
    expect(followUpState("2026-12-15", "2026-11-27")).toBe("later");
  });
});

describe("dealInput", () => {
  const stage = "6b0f3a52-7c1e-4a8e-9d55-2f6b1c3e9a10";
  it("needs a client or a new company name", () => {
    expect(dealInput.safeParse({ title: "X", stage_id: stage }).success).toBe(false);
    const r = dealInput.parse({ title: "X", stage_id: stage, new_client_name: "New Co", value: "3,000" });
    expect(r).toMatchObject({ client_id: null, new_client_name: "New Co", value_cents: 300000, source: "other" });
  });
  it("rejects a bad amount", () => {
    expect(dealInput.safeParse({ title: "X", stage_id: stage, new_client_name: "A", value: "lots" }).success).toBe(false);
  });
});

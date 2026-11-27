import { describe, expect, it } from "vitest";
import { editorPayload, scheduleAmounts, lineTotalCents, parsePercent, parseQuantity, readyToSend, taxCents, totals } from "@/features/proposals/model";

describe("proposal money (mirrors the database)", () => {
  it("line totals round half-up", () => {
    expect(lineTotalCents(185000, 100)).toBe(185000);
    expect(lineTotalCents(4000, 250)).toBe(10000);
    expect(lineTotalCents(333, 150)).toBe(500); // 4.995 → 5.00
  });
  it("ITBMS 7% rounds half-up to the cent", () => {
    expect(taxCents(185000, 700)).toBe(12950);
    expect(taxCents(245000, 700)).toBe(17150);
    expect(taxCents(7, 700)).toBe(0); // 0.49¢
    expect(taxCents(8, 700)).toBe(1); // 0.56¢
  });
  it("totals exclude optional items unless chosen", () => {
    const items = [
      { id: "a", unit_price_cents: 185000, quantity_hundredths: 100, optional: false },
      { id: "b", unit_price_cents: 4000, quantity_hundredths: 250, optional: false },
      { id: "c", unit_price_cents: 50000, quantity_hundredths: 100, optional: true },
    ];
    expect(totals(items, 700)).toEqual({ subtotal: 195000, tax: 13650, total: 208650, optional: 50000 });
    expect(totals(items, 700, ["c"]).total).toBe(262150); // same as the acceptance test in the database
  });
});

describe("parsing", () => {
  it("quantities and percentages", () => {
    expect(parseQuantity("1")).toBe(100);
    expect(parseQuantity("2,5")).toBe(250);
    expect(parseQuantity("0")).toBe("invalid");
    expect(parseQuantity("-1")).toBe("invalid");
    expect(parsePercent("50")).toBe(5000);
    expect(parsePercent("33.33%")).toBe(3333);
    expect(parsePercent("120")).toBe("invalid");
  });
});

describe("ready to send", () => {
  const ok = { items: [{ optional: false }], milestones: [{ percent_bps: 5000 }, { percent_bps: 5000 }], valid_until: "2026-12-31" };
  it("passes a complete proposal", () => expect(readyToSend(ok, "2026-11-27")).toEqual([]));
  it("lists what's missing", () => {
    expect(readyToSend({ items: [{ optional: true }], milestones: [{ percent_bps: 6000 }], valid_until: "2026-01-01" }, "2026-11-27")).toEqual([
      "Add at least one line item that isn't optional.",
      "The payment schedule adds up to 60%, not 100%.",
      'The "valid until" date is in the past.',
    ]);
  });
});

describe("editor payload", () => {
  it("validates line items and payments", () => {
    const base = { title: "X", language: "es", tax_rate_bps: 700, valid_until: "", sections: [], milestones: [] };
    expect(editorPayload.safeParse({ ...base, items: [{ name: "Build", description: "", quantity: "1", unit_price: "1,850", optional: false }] }).success).toBe(true);
    expect(editorPayload.safeParse({ ...base, items: [{ name: "Build", description: "", quantity: "x", unit_price: "abc", optional: false }] }).success).toBe(false);
  });
});

describe("payment schedule amounts", () => {
  it("always add up to the total exactly", () => {
    expect(scheduleAmounts(262150, [5000, 5000])).toEqual([131075, 131075]);
    expect(scheduleAmounts(100001, [3333, 3333, 3334])).toEqual([33330, 33330, 33341]);
    const parts = scheduleAmounts(208651, [5000, 5000]);
    expect(parts[0] + parts[1]).toBe(208651);
  });
});

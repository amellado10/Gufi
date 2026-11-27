// Reproduces the "El reparto 15 · 60 · 25" page of the 2026 partners' summary to the cent.
import { describe, expect, it } from "vitest";
import { partnerAmounts, splitPools, type SplitShare } from "@/features/finance/split";

const D = "Daniel", C = "Camila", A = "Adrián";
const projects: { name: string; contract: number; shares: SplitShare[] }[] = [
  { name: "Reve", contract: 185000, shares: [{ partnerId: D, role: "origination", shareBps: 10000 }, { partnerId: A, role: "delivery", shareBps: 5000 }, { partnerId: C, role: "delivery", shareBps: 5000 }] },
  { name: "Mixo", contract: 175000, shares: [{ partnerId: C, role: "origination", shareBps: 10000 }, { partnerId: C, role: "delivery", shareBps: 10000 }] },
  { name: "Mini and Co", contract: 215000, shares: [{ partnerId: D, role: "origination", shareBps: 10000 }, { partnerId: C, role: "delivery", shareBps: 10000 }] },
  { name: "Flora Lab", contract: 85000, shares: [{ partnerId: C, role: "origination", shareBps: 10000 }, { partnerId: C, role: "delivery", shareBps: 10000 }] },
  { name: "Functional Burn", contract: 90000, shares: [{ partnerId: D, role: "origination", shareBps: 10000 }, { partnerId: C, role: "delivery", shareBps: 10000 }] },
  { name: "Nodos Agency", contract: 125000, shares: [{ partnerId: D, role: "origination", shareBps: 10000 }, { partnerId: C, role: "delivery", shareBps: 10000 }] },
  { name: "Trophy Bay", contract: 130000, shares: [{ partnerId: D, role: "origination", shareBps: 10000 }, { partnerId: C, role: "delivery", shareBps: 10000 }] },
  { name: "Mad Chuck", contract: 85000, shares: [{ partnerId: D, role: "origination", shareBps: 10000 }, { partnerId: C, role: "delivery", shareBps: 10000 }] },
  { name: "Curio Studio", contract: 56000, shares: [{ partnerId: C, role: "origination", shareBps: 10000 }, { partnerId: C, role: "delivery", shareBps: 10000 }] },
  { name: "Fast Media", contract: 450000, shares: [{ partnerId: A, role: "origination", shareBps: 10000 }, { partnerId: C, role: "delivery", shareBps: 10000 }] },
];

describe("15/60/25 split (PDF page 5)", () => {
  it("matches the per-project 15% / 60% / 25% columns", () => {
    expect(splitPools(185000)).toEqual({ origination: BigInt(27750), delivery: BigInt(111000), company: BigInt(46250) });
    expect(splitPools(56000)).toEqual({ origination: BigInt(8400), delivery: BigInt(33600), company: BigInt(14000) });
  });

  it("matches the totals: $15,960 → $2,394 / $9,576 / $3,990", () => {
    const sum = projects.reduce(
      (acc, p) => {
        const pool = splitPools(p.contract);
        return { contract: acc.contract + BigInt(p.contract), o: acc.o + pool.origination, d: acc.d + pool.delivery, g: acc.g + pool.company };
      },
      { contract: BigInt(0), o: BigInt(0), d: BigInt(0), g: BigInt(0) },
    );
    expect(sum).toEqual({ contract: BigInt(1596000), o: BigInt(239400), d: BigInt(957600), g: BigInt(399000) });
  });

  it("matches what each partner is owed: Daniel $1,245, Camila $9,495, Adrián $1,230", () => {
    const owed = new Map<string, { o: bigint; d: bigint }>();
    for (const p of projects) {
      for (const a of partnerAmounts(p.contract, p.shares)) {
        const cur = owed.get(a.partnerId) ?? { o: BigInt(0), d: BigInt(0) };
        if (a.role === "origination") cur.o += a.cents;
        else cur.d += a.cents;
        owed.set(a.partnerId, cur);
      }
    }
    expect(owed.get(D)).toEqual({ o: BigInt(124500), d: BigInt(0) });
    expect(owed.get(C)).toEqual({ o: BigInt(47400), d: BigInt(902100) });
    expect(owed.get(A)).toEqual({ o: BigInt(67500), d: BigInt(55500) });
    // Balances after payments: Camila was paid $3,566.70, Adrián $675.
    expect(owed.get(C)!.o + owed.get(C)!.d - BigInt(356670)).toBe(BigInt(592830));
    expect(owed.get(A)!.o + owed.get(A)!.d - BigInt(67500)).toBe(BigInt(55500));
  });

  it("rounds half-up to the cent", () => {
    expect(splitPools(1).origination).toBe(BigInt(0)); // 0.15¢ → 0
    expect(splitPools(10).origination).toBe(BigInt(2)); // 1.5¢ → 2
  });
});

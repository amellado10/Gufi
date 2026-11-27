// The split model: 15% fixed for whoever brought the client, custom percentages for the team, Güfi
// keeps the rest. Reproduces the 2026 partners' summary (page 5) to the cent.
import { describe, expect, it } from "vitest";
import { partnerAmounts, percentOf, splitContract, splitProblems, type SplitLine } from "@/features/finance/split";

const D = "Daniel", C = "Camila", A = "Adrián";
const std = (brought: string, did: string): SplitLine[] => [
  { partnerId: brought, role: "origination", percentBps: 1500 },
  { partnerId: did, role: "delivery", percentBps: 6000 },
];
const projects: { name: string; contract: number; lines: SplitLine[] }[] = [
  { name: "Reve", contract: 185000, lines: [{ partnerId: D, role: "origination", percentBps: 1500 }, { partnerId: A, role: "delivery", percentBps: 3000 }, { partnerId: C, role: "delivery", percentBps: 3000 }] },
  { name: "Mixo", contract: 175000, lines: std(C, C) },
  { name: "Mini and Co", contract: 215000, lines: std(D, C) },
  { name: "Flora Lab", contract: 85000, lines: std(C, C) },
  { name: "Functional Burn", contract: 90000, lines: std(D, C) },
  { name: "Nodos Agency", contract: 125000, lines: std(D, C) },
  { name: "Trophy Bay", contract: 130000, lines: std(D, C) },
  { name: "Mad Chuck", contract: 85000, lines: std(D, C) },
  { name: "Curio Studio", contract: 56000, lines: std(C, C) },
  { name: "Fast Media", contract: 450000, lines: std(A, C) },
];

describe("split (PDF page 5)", () => {
  it("matches per-project 15% / team / Güfi", () => {
    const reve = splitContract(185000, projects[0].lines);
    expect(reve.lines.map((l) => Number(l.cents))).toEqual([27750, 55500, 55500]);
    expect(reve.company).toBe(BigInt(46250));
    expect(reve.companyBps).toBe(2500);
  });

  it("matches the totals: $15,960 → $2,394 / $9,576 / $3,990", () => {
    let o = BigInt(0), d = BigInt(0), g = BigInt(0);
    for (const p of projects) {
      const s = splitContract(p.contract, p.lines);
      for (const l of s.lines) {
        if (l.role === "origination") o += l.cents;
        else d += l.cents;
      }
      g += s.company;
    }
    expect([o, d, g]).toEqual([BigInt(239400), BigInt(957600), BigInt(399000)]);
  });

  it("matches what each partner earned: Daniel $1,245, Camila $9,495, Adrián $1,230", () => {
    const owed = new Map<string, bigint>();
    for (const p of projects) for (const a of partnerAmounts(p.contract, p.lines)) owed.set(a.partnerId, (owed.get(a.partnerId) ?? BigInt(0)) + a.cents);
    expect(owed.get(D)).toBe(BigInt(124500));
    expect(owed.get(C)).toBe(BigInt(949500));
    expect(owed.get(A)).toBe(BigInt(123000));
  });
});

describe("custom splits", () => {
  it("lets the team share be anything; Güfi keeps the exact remainder", () => {
    const s = splitContract(100001, [
      { partnerId: D, role: "origination", percentBps: 1500 },
      { partnerId: C, role: "delivery", percentBps: 4500 },
      { partnerId: A, role: "delivery", percentBps: 1250 },
    ]);
    expect(s.companyBps).toBe(2750);
    expect(s.lines.reduce((a, l) => a + l.cents, BigInt(0)) + s.company).toBe(BigInt(100001));
  });
  it("when Güfi or nobody brought the client, the 15% stays with Güfi", () => {
    const s = splitContract(100000, [{ partnerId: C, role: "delivery", percentBps: 6000 }]);
    expect(s.companyBps).toBe(4000);
    expect(s.company).toBe(BigInt(40000));
  });
  it("rejects more than 15% for bringing the client, over 100%, zeros and duplicates", () => {
    expect(splitProblems([{ partnerId: D, role: "origination", percentBps: 2000 }])).toContain("Whoever brought the client gets 15%, not more.");
    expect(splitProblems([{ partnerId: C, role: "delivery", percentBps: 9000 }, { partnerId: A, role: "delivery", percentBps: 2000 }])[0]).toMatch(/110%/);
    expect(splitProblems([{ partnerId: C, role: "delivery", percentBps: 0 }])).toContain("Every person needs a percentage above 0.");
    expect(splitProblems([{ partnerId: C, role: "delivery", percentBps: 10 }, { partnerId: C, role: "delivery", percentBps: 10 }])).toContain("Each person appears once in the team.");
    expect(splitProblems(projects[0].lines)).toEqual([]);
  });
  it("rounds half-up to the cent", () => {
    expect(percentOf(10, 1500)).toBe(BigInt(2)); // 1.5¢ → 2
    expect(percentOf(1, 1500)).toBe(BigInt(0));
  });
});

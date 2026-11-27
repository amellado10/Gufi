// The Güfi revenue split, per project, on the contract before tax:
//  - 15% to whoever brought the client (fixed; it stays with Güfi when Güfi brought it or nobody did)
//  - the rest is split per project between the people who did the work (custom percentages)
//  - Güfi keeps whatever isn't assigned.
// Each line is a percentage of the contract in basis points (3000 = 30%). Integer cents, BigInt,
// half-up rounding; Güfi's amount is the exact remainder, so the parts always add up to the contract.

export type SplitRole = "origination" | "delivery";
export type SplitLine = { partnerId: string; role: SplitRole; percentBps: number };

export const ORIGINATION_BPS = 1500;
const TEN_THOUSAND = BigInt(10_000);

const big = (n: number | bigint) => (typeof n === "bigint" ? n : BigInt(Math.trunc(n)));

// contract × percent, rounded half-up to the cent.
export function percentOf(contractCents: number | bigint, percentBps: number): bigint {
  const c = big(contractCents);
  if (c < BigInt(0) || percentBps < 0) throw new Error("Split amounts must be non-negative");
  return (c * BigInt(percentBps) * BigInt(2) + TEN_THOUSAND) / (TEN_THOUSAND * BigInt(2));
}

export function partnerAmounts(contractCents: number | bigint, lines: SplitLine[]) {
  return lines.map((l) => ({ ...l, cents: percentOf(contractCents, l.percentBps) }));
}

// The whole split of one contract: each person's amount and what Güfi keeps.
export function splitContract(contractCents: number | bigint, lines: SplitLine[]) {
  const amounts = partnerAmounts(contractCents, lines);
  const assignedBps = lines.reduce((a, l) => a + l.percentBps, 0);
  const assigned = amounts.reduce((a, l) => a + l.cents, BigInt(0));
  return {
    lines: amounts,
    companyBps: 10_000 - assignedBps,
    company: big(contractCents) - assigned,
    originationBps: lines.filter((l) => l.role === "origination").reduce((a, l) => a + l.percentBps, 0),
    deliveryBps: lines.filter((l) => l.role === "delivery").reduce((a, l) => a + l.percentBps, 0),
  };
}

// Problems with a split before saving (the database enforces the same limits).
export function splitProblems(lines: SplitLine[]): string[] {
  const problems: string[] = [];
  const origination = lines.filter((l) => l.role === "origination").reduce((a, l) => a + l.percentBps, 0);
  const total = lines.reduce((a, l) => a + l.percentBps, 0);
  if (origination > ORIGINATION_BPS) problems.push("Whoever brought the client gets 15%, not more.");
  if (total > 10_000) problems.push(`The split adds up to ${total / 100}%, more than 100% of the contract.`);
  if (lines.some((l) => l.percentBps <= 0)) problems.push("Every person needs a percentage above 0.");
  const seen = new Set<string>();
  for (const l of lines) {
    const key = `${l.role}:${l.partnerId}`;
    if (seen.has(key)) problems.push("Each person appears once in the team.");
    seen.add(key);
  }
  return [...new Set(problems)];
}

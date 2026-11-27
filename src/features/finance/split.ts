// The Güfi revenue split: of each contract (before tax), 15% to whoever brought the client
// ("origination"), 60% to whoever did the work ("delivery"), and the rest stays with Güfi.
// All math is integer cents with BigInt; amounts round half-up to the cent.

export type SplitRole = "origination" | "delivery";
export type SplitShare = { partnerId: string; role: SplitRole; shareBps: number };
export type SplitPolicy = { originationBps: number; deliveryBps: number };

export const DEFAULT_POLICY: SplitPolicy = { originationBps: 1500, deliveryBps: 6000 };

const big = (n: number | bigint) => (typeof n === "bigint" ? n : BigInt(Math.trunc(n)));

// value * numerator / denominator, rounded half-up (values are non-negative).
export function mulDivRound(value: bigint, numerator: bigint, denominator: bigint): bigint {
  if (value < BigInt(0) || numerator < BigInt(0)) throw new Error("Split amounts must be non-negative");
  return (value * numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
}

// Pools for one contract.
export function splitPools(contractCents: number | bigint, policy: SplitPolicy = DEFAULT_POLICY) {
  const c = big(contractCents);
  const origination = mulDivRound(c, BigInt(policy.originationBps), BigInt(10_000));
  const delivery = mulDivRound(c, BigInt(policy.deliveryBps), BigInt(10_000));
  return { origination, delivery, company: c - origination - delivery };
}

// Each partner's amount on one project.
export function partnerAmounts(contractCents: number | bigint, shares: SplitShare[], policy: SplitPolicy = DEFAULT_POLICY) {
  const c = big(contractCents);
  return shares.map((s) => {
    const roleBps = BigInt(s.role === "origination" ? policy.originationBps : policy.deliveryBps);
    // contract × role% × person's share of the role, in one rounding step
    return { ...s, cents: mulDivRound(c, roleBps * BigInt(s.shareBps), BigInt(100_000_000)) };
  });
}

export const centsToNumber = (c: bigint) => Number(c); // safe: agency-sized amounts

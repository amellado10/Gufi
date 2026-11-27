// Money rules (AGENTS.md §5.6): amounts are integer minor units (cents) with an explicit
// ISO 4217 currency code. Never floats for authoritative math; never add different currencies.
// Formatting only lives here; calculations stay in integer cents.

export type Money = { cents: bigint | number; currency: string };

export function formatMoney({ cents, currency }: Money, locale = "en-US"): string {
  const value = typeof cents === "bigint" ? cents : BigInt(Math.trunc(cents));
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const whole = abs / BigInt(100);
  const fraction = Number(abs % BigInt(100));
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Format the whole part through Intl (separators, symbol), then splice in the exact cents.
  const parts = formatter.formatToParts(0);
  const out = parts
    .map((p) => {
      if (p.type === "integer") return new Intl.NumberFormat(locale, { useGrouping: true }).format(whole);
      if (p.type === "fraction") return String(fraction).padStart(2, "0");
      return p.value;
    })
    .join("");
  return negative ? `-${out}` : out;
}

export function sumCents(items: Money[]): Money | null {
  if (items.length === 0) return null;
  const currency = items[0].currency;
  if (items.some((i) => i.currency !== currency)) {
    throw new Error("Cannot add amounts in different currencies without an explicit conversion");
  }
  return { currency, cents: items.reduce((acc, i) => acc + BigInt(i.cents), BigInt(0)) };
}

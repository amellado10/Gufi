// Phone numbers as people type them ("6123-4567", "+507 6123 4567", "+1 (305) 555-0100").
// Stored as typed (tidied); converted to digits-with-country-code for WhatsApp links.
// Güfi is in Panama, so a number without a country code is taken as Panamanian (+507).

export const DEFAULT_COUNTRY_CODE = "507";

export function digitsOf(phone: string): string {
  return phone.replace(/\D/g, "");
}

// null = empty; "invalid" = not a phone number.
export function tidyPhone(input: string | null | undefined): string | null | "invalid" {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (!/^\+?[\d\s().-]+$/.test(raw)) return "invalid";
  const digits = digitsOf(raw);
  if (digits.length < 7 || digits.length > 15) return "invalid";
  return raw.replace(/\s+/g, " ");
}

// Digits for https://wa.me/<number>, or null if it can't be a WhatsApp number.
export function whatsappNumber(phone: string | null | undefined, defaultCountry = DEFAULT_COUNTRY_CODE): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = digitsOf(trimmed);
  if (trimmed.startsWith("+")) return digits.length >= 8 ? digits : null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length <= 8) digits = defaultCountry + digits; // local number
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const n = whatsappNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

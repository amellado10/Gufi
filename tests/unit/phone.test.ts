import { describe, expect, it } from "vitest";
import { tidyPhone, whatsappLink, whatsappNumber } from "@/lib/phone";

describe("phones", () => {
  it("accepts the usual ways of typing a number", () => {
    expect(tidyPhone("6123-4567")).toBe("6123-4567");
    expect(tidyPhone(" +507  6123 4567 ")).toBe("+507 6123 4567");
    expect(tidyPhone("+1 (305) 555-0100")).toBe("+1 (305) 555-0100");
    expect(tidyPhone("")).toBeNull();
  });
  it("rejects what isn't a phone number", () => {
    for (const bad of ["call me", "123", "+12345678901234567", "6123-4567 ext 2"]) expect(tidyPhone(bad)).toBe("invalid");
  });
  it("builds WhatsApp numbers, assuming Panama for local numbers", () => {
    expect(whatsappNumber("6123-4567")).toBe("50761234567");
    expect(whatsappNumber("+507 6123 4567")).toBe("50761234567");
    expect(whatsappNumber("+1 (305) 555-0100")).toBe("13055550100");
    expect(whatsappNumber("00 507 6123 4567")).toBe("50761234567");
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappLink("6123-4567", "Hola & bienvenido")).toBe("https://wa.me/50761234567?text=Hola%20%26%20bienvenido");
  });
});

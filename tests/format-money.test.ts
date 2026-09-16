import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/format/money";

describe("formatMoney (PRD 7.4 rule 11 / 10 [Supuesto: USD, $1,234.56])", () => {
  it("formats a whole number with two decimals and a dollar sign", () => {
    expect(formatMoney(35)).toBe("$35.00");
  });

  it("formats a value with cents, rounded to two decimals", () => {
    expect(formatMoney(12.5)).toBe("$12.50");
  });

  it("groups thousands with commas", () => {
    expect(formatMoney(1234.56)).toBe("$1,234.56");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("falls back to $0.00 for non-finite input instead of throwing", () => {
    expect(formatMoney(Number.NaN)).toBe("$0.00");
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe("$0.00");
  });
});

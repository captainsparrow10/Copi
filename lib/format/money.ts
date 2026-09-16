/**
 * Money formatting (PRD 7.4 rule 11 "Moneda: USD [Supuesto]"; 10 "moneda y
 * formato? [Supuesto: USD, `$1,234.56`]"). Pure so it's trivially unit-tested
 * and reusable everywhere a copay amount is rendered.
 */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats a number of dollars as `$1,234.56` (PRD's assumed format). */
export function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return usdFormatter.format(0);
  return usdFormatter.format(amount);
}

/**
 * US phone formatting, for one reason: so a missing digit is visible.
 *
 * A validation message after the fact tells you that you got it wrong. A mask
 * that fills in as you type shows you WHERE — `(205) 555-014` is visibly one
 * character short of the shape everyone in the country recognises, in a way
 * that `2055550143` never is.
 *
 * ── DELIBERATELY US-ONLY, AND WHY THAT IS DEFENSIBLE HERE ────────────────────
 *
 * A general phone formatter is a large problem and a bad bet. This is a single
 * takeout counter on Center Point Parkway whose customers are collecting food
 * in person, so a caller with a non-US number is not a case worth degrading the
 * common one for.
 *
 * It degrades rather than blocks: anything that is not ten digits is passed
 * through as typed and left for the validator to judge, so a +44 number is
 * awkward but not rejected by the formatter.
 */

/** Digits only, with the US country code dropped when it is redundant. */
export function phoneDigits(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/**
 * Formats progressively, so the shape appears as the number is typed rather
 * than snapping into place at the end.
 *
 * Anything past ten digits is returned untouched: at that point it is either a
 * paste with an extension or an international number, and mangling it would be
 * worse than leaving it alone.
 */
export function formatPhone(input: string): string {
  const d = phoneDigits(input);
  if (d.length > 10) return input;
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Ten digits, no more and no fewer. */
export function isCompletePhone(input: string): boolean {
  return phoneDigits(input).length === 10;
}

/** How many are still missing — the difference between "wrong" and "nearly". */
export function phoneDigitsRemaining(input: string): number {
  return Math.max(0, 10 - phoneDigits(input).length);
}

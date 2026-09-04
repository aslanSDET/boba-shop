/**
 * Composite an element's colour over its real ancestor background stack, and
 * return the WCAG contrast ratio.
 *
 * ── WHY COMPOSITED, NOT ASSUMED ───────────────────────────────────────────────
 *
 * A colour reasoned about against `#fff` in a comment and a colour rendered on
 * the actual page are not always the same number. `--green` was darkened
 * specifically so white text would clear AA against it, checked against pure
 * `#fff` — 3.93:1 -> 4.67:1. But the elements that mattered were
 * `rgba(255,255,255,0.94)` and `rgba(255,255,255,0.78)`, which composite to
 * 4.33:1 and 3.49:1 — both still failures, on a commit that had asserted "zero
 * AA failures." Nothing caught it, because contrast was a one-off manual pass
 * and the suite asserted geometry only. A colour does not announce itself when
 * it regresses the way an overflowing box does, so it gets measured here, the
 * way a browser actually paints it, rather than against an assumed background.
 *
 * ── AND WHY THE ELEMENT'S OWN `opacity` IS PART OF THE COMPOSITE ─────────────
 *
 * `opacity` does not touch `color` — `getComputedStyle(el).color` reports the
 * same ink whether the element is at 70% or 80%. What changes is how that ink
 * BLENDS with whatever sits behind it, which is exactly the mechanism a
 * de-emphasised amount on a coloured button relies on (checkout.tsx's tip
 * total: `opacity-80` over `bg-primary`, ink #1a1512 -> perceived #462e14,
 * 5.38:1; `opacity-70` -> #5c3a16, 4.30:1 — a failure `color` alone cannot see).
 * So the element's own `opacity` is folded into the alpha before compositing,
 * the same way a browser actually paints it. This only accounts for the
 * MEASURED element's own opacity, not an ancestor's — sufficient for every
 * case in this suite, where the opacity sits on the text node's own element.
 *
 * ── WHY TWO FUNCTIONS, DUPLICATING THE SAME MATH ─────────────────────────────
 *
 * `page.evaluate(fn, arg)` and `Locator.evaluate(fn)` both serialize `fn` with
 * `Function.prototype.toString()` and re-parse it INSIDE THE PAGE — with no
 * access to this module's scope, so `measureContrast` cannot call
 * `contrastOfElement` as a helper the way it would in ordinary TypeScript. Each
 * exported function has to be independently self-contained, which is why the
 * compositing logic appears twice rather than once. Tried the shared-helper
 * version first: it broke every Asian Kitchen contrast test silently reporting
 * `ratio: 0`, because `contrastOfElement` did not exist as a global in the
 * page — the exact failure mode this comment exists to head off.
 *
 * Shared across restaurants (`tests/contrast.spec.ts` for Asian Kitchen,
 * `tests/snowdaes-journeys.spec.ts` for Snowdaes) because the algorithm is
 * WCAG's, not either shop's — only the selectors and the failures they guard
 * against differ.
 */

/** WCAG 2.2 SC 1.4.3: 4.5:1 for body text, 3:1 only once type is >=18.66px. */
export const AA_SMALL = 4.5;

export interface ContrastResult {
  ratio: number;
  size: number;
  error?: string;
}

/**
 * By CSS selector, for `page.evaluate(measureContrast, selector)`. Every
 * selector in `tests/contrast.spec.ts` is a plain class, so this is what that
 * file uses throughout.
 */
export function measureContrast(selector: string): ContrastResult {
  const el = document.querySelector(selector);
  if (!el) return { ratio: 0, size: 0, error: "not found: " + selector };

  const parse = (s: string): number[] | null => {
    const m = s.match(/[\d.]+/g);
    if (!m) return null;
    return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1];
  };
  const over = (fg: number[], bg: number[]) =>
    [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));

  let bg = [255, 255, 255];
  const stack: number[][] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = parse(getComputedStyle(n).backgroundColor);
    if (c && c[3] > 0) stack.push(c);
    if (c && c[3] === 1) break;
  }
  for (const layer of stack.reverse()) bg = over(layer, bg);

  const fg = parse(getComputedStyle(el).color);
  if (!fg) return { ratio: 0, size: 0, error: "no colour on " + selector };
  const elementOpacity = parseFloat(getComputedStyle(el).opacity);
  const combinedAlpha = fg[3] * (Number.isFinite(elementOpacity) ? elementOpacity : 1);
  const text = over([fg[0], fg[1], fg[2], combinedAlpha], bg);

  const lum = (c: number[]) => {
    const f = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const a = lum(text);
  const b = lum(bg);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    size: parseFloat(getComputedStyle(el).fontSize),
    error: undefined,
  };
}

/**
 * By element, for `locator.evaluate(contrastOfElement)` — when the target
 * cannot be picked out by a plain CSS selector (the Snowdaes discount row is
 * found by its promo code's text, which has no class name of its own).
 *
 * Deliberately NOT implemented by calling `measureContrast` on a synthesised
 * selector: this function has to survive being copied into the page on its
 * own, so it carries the same compositing logic rather than reusing it.
 */
export function contrastOfElement(el: Element): ContrastResult {
  const parse = (s: string): number[] | null => {
    const m = s.match(/[\d.]+/g);
    if (!m) return null;
    return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1];
  };
  const over = (fg: number[], bg: number[]) =>
    [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));

  let bg = [255, 255, 255];
  const stack: number[][] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = parse(getComputedStyle(n).backgroundColor);
    if (c && c[3] > 0) stack.push(c);
    if (c && c[3] === 1) break;
  }
  for (const layer of stack.reverse()) bg = over(layer, bg);

  const fg = parse(getComputedStyle(el).color);
  if (!fg) return { ratio: 0, size: 0, error: "no colour on element" };
  const elementOpacity = parseFloat(getComputedStyle(el).opacity);
  const combinedAlpha = fg[3] * (Number.isFinite(elementOpacity) ? elementOpacity : 1);
  const text = over([fg[0], fg[1], fg[2], combinedAlpha], bg);

  const lum = (c: number[]) => {
    const f = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  };
  const a = lum(text);
  const b = lum(bg);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    size: parseFloat(getComputedStyle(el).fontSize),
    error: undefined,
  };
}

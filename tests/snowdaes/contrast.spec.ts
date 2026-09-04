import { test, expect, type Page } from "@playwright/test";

/**
 * Snowdaes: can you read the promo cards?
 *
 * ── WHY THIS CANNOT USE `tests/support/contrast.ts` ──────────────────────────
 *
 * That helper composites an element's ink over its ancestors' `backgroundColor`
 * and stops at the first opaque one. Every card in this rail paints its wash as
 * a `background-image` — `radial-gradient(… color-mix(… var(--promo-tint-N) …))`
 * set inline — and the `background` shorthand resets `background-color` to
 * `transparent`. So `getComputedStyle(card).backgroundColor` is `rgba(0,0,0,0)`,
 * the helper walks straight past the tint, and measures the type against the
 * page ground it would have had if the card had no wash at all.
 *
 * That is not a near miss. Worked through by hand, `--muted-foreground`
 * (#6f6259) reads 5.89:1 on white and 4.04:1 through tint 3 at its strongest —
 * a real AA failure the helper would have reported as a comfortable pass. A
 * green suite asserting the wrong background is worse than no suite, so this
 * file does not reason about the gradient at all.
 *
 * ── SO IT SAMPLES THE PIXEL ──────────────────────────────────────────────────
 *
 * Paint the glyphs away with `color: transparent`, screenshot the card, and
 * read back the colour the browser actually composited where the text was. No
 * gradient maths, no assumption about where a colour stop lands — whatever
 * Chromium painted is the background, including both translucent stops and the
 * page underneath them.
 *
 * `color: transparent` rather than `visibility: hidden`, which was the first
 * attempt and got one answer badly wrong: the `In store` badge IS its own dark
 * pill (`bg-foreground`), so hiding the element took its background with it and
 * the probe sampled the card a layer below — reporting 1.02:1 for white-on-dark
 * type that actually clears AA comfortably. Removing only the ink leaves every
 * background, the element's own included, exactly where the compositor put it.
 *
 * The PNG is decoded by handing it back to the page as a data URL and drawing
 * it on a canvas: the browser already has a decoder and the suite does not need
 * an image dependency to borrow one.
 */

/** WCAG 2.2 SC 1.4.3. Large is >=24px, or >=18.66px at 700+. */
const AA_SMALL = 4.5;
const AA_LARGE = 3;

const PHONE = { width: 390, height: 844 };

interface Line {
  text: string;
  /** Ink, with the element's own `opacity` already folded into the alpha. */
  ink: [number, number, number, number];
  size: number;
  weight: number;
  /** Viewport coordinates of the line's centre, for the screenshot sample. */
  x: number;
  y: number;
}

function luminance([r, g, b]: number[]): number {
  const f = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

function contrast(fg: number[], bg: number[]): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Every line of type in one card, with the ink it will be measured by. */
async function linesOf(page: Page, cardIndex: number): Promise<Line[]> {
  return page.evaluate((n) => {
    const card = document.querySelectorAll("[aria-label='Featured'] li")[n];
    const out: Line[] = [];
    for (const el of Array.from(card.querySelectorAll("span"))) {
      /* Only leaves that carry their own text: the CTA span wraps an <svg>,
         and a wrapper would sample a point that is not on a glyph. */
      if (!el.textContent?.trim()) continue;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const rgba = (style.color.match(/[\d.]+/g) ?? []).map(Number);
      const own = parseFloat(style.opacity);
      out.push({
        text: el.textContent.trim().slice(0, 40),
        ink: [
          rgba[0],
          rgba[1],
          rgba[2],
          (rgba.length > 3 ? rgba[3] : 1) * (Number.isFinite(own) ? own : 1),
        ],
        size: parseFloat(style.fontSize),
        weight: Number(style.fontWeight) || 400,
        /* The left edge plus a few px, not the centre: a balanced heading's
           second line can be short, and the centre of the BOX can fall past the
           end of the text on a background that differs from the one under the
           glyphs. A point just inside the box is over the same ground the first
           character sits on. */
        x: box.left + Math.min(6, box.width / 2),
        y: box.top + box.height / 2,
      });
    }
    return out as never;
  }, cardIndex);
}

/**
 * The colours the browser actually painted at those points.
 *
 * `page.screenshot()` is viewport-sized, so viewport coordinates index it
 * directly — but only at a 1x device pixel ratio, so the ratio is measured off
 * the decoded image rather than assumed.
 */
async function paintedAt(page: Page, points: { x: number; y: number }[]) {
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate(
    ({ png, points }) =>
      new Promise<number[][]>((resolve, reject) => {
        const img = new Image();
        img.onerror = () => reject(new Error("the screenshot did not decode"));
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("no 2d context"));
          ctx.drawImage(img, 0, 0);
          const scale = img.width / window.innerWidth;
          resolve(
            points.map((p) => {
              const d = ctx.getImageData(
                Math.round(p.x * scale),
                Math.round(p.y * scale),
                1,
                1,
              ).data;
              return [d[0], d[1], d[2]];
            }),
          );
        };
        img.src = "data:image/png;base64," + png;
      }),
    { png, points },
  );
}

test.describe("Snowdaes promo rail contrast", () => {
  test.use({ viewport: PHONE });

  test("every line on every card clears AA against the tint painted behind it", async ({
    page,
  }) => {
    await page.goto("/");
    const cards = page.getByRole("region", { name: "Featured" }).getByRole("listitem");
    const count = await cards.count();
    expect(count, "the rail should still ship five cards").toBe(5);

    for (let n = 0; n < count; n++) {
      await cards.nth(n).scrollIntoViewIfNeeded();
      /* Let the rail's snap settle before anything is measured — a box read
         mid-scroll indexes the screenshot at the wrong pixel. */
      await page.waitForTimeout(400);

      const lines = await linesOf(page, n);
      expect(lines.length, `card ${n} should hold type to measure`).toBeGreaterThan(0);

      await page.evaluate((i) => {
        const card = document.querySelectorAll("[aria-label='Featured'] li")[i];
        for (const el of Array.from(card.querySelectorAll("span"))) {
          (el as HTMLElement).style.color = "transparent";
        }
      }, n);

      const grounds = await paintedAt(page, lines);

      await page.evaluate((i) => {
        const card = document.querySelectorAll("[aria-label='Featured'] li")[i];
        for (const el of Array.from(card.querySelectorAll("span"))) {
          (el as HTMLElement).style.color = "";
        }
      }, n);

      lines.forEach((line, i) => {
        const ground = grounds[i];
        /* Fold the ink's own alpha into the ground the same way the compositor
           does, then compare the two opaque colours. */
        const painted = [0, 1, 2].map(
          (c) => line.ink[c] * line.ink[3] + ground[c] * (1 - line.ink[3]),
        );
        const ratio = contrast(painted, ground);
        const large = line.size >= 24 || (line.size >= 18.66 && line.weight >= 700);
        const floor = large ? AA_LARGE : AA_SMALL;
        expect
          .soft(
            Math.round(ratio * 100) / 100,
            `card ${n} — "${line.text}" at ${line.size}px/${line.weight} on ` +
              `rgb(${ground.map(Math.round).join(",")})`,
          )
          .toBeGreaterThanOrEqual(floor);
      });
    }
  });
});

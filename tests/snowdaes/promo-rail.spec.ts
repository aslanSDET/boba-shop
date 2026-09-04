import { test, expect, type Page } from "@playwright/test";

/**
 * Snowdaes: the promo rail on the home page.
 *
 * The rail had NO coverage when it was written — the 52 tests that existed all
 * drove checkout and the cart, so a green suite said nothing about it. A mobile
 * review then found a real defect nobody would have caught: the pagination dots
 * were 6x6px buttons with no padding, so a tap 8px off missed entirely, and
 * since the arrows are desktop-only those dots were the only way to reach a
 * card on a phone.
 *
 * That is what this file is for. It asserts the things that broke or nearly
 * broke, not the markup:
 *
 *   - the dots are big enough to hit, MEASURED as a hit area rather than read
 *     off a class name
 *   - a card that names an item opens that item, and does not merely jump the
 *     grid to its category
 *   - opening from a card does NOT scroll the page (a smooth scroll racing the
 *     drawer's mount landed differently on every viewport)
 *   - the tote card, which is in-store only, offers nothing to tap
 *   - the rail scrolls, the page does not scroll sideways with it
 */

const PHONE = { width: 390, height: 844 };

/** Every card the rail ships, in order. */
const CARDS = [
  "Billerica is serving",
  "Pandan Mango Sticky Rice",
  "Spend $25, take home a tote",
  "Thai Dye snow",
  "Six toppings, your call",
];

function rail(page: Page) {
  return page.getByRole("region", { name: "Featured" });
}

/**
 * The cards, scoped to the rail's own list.
 *
 * Not `rail.getByRole("button", { name: /Thai Dye snow/ })` — each dot is
 * labelled "Show <that card's title>", so a name match hits the card AND its
 * dot and Playwright fails on strict mode. The list holds only cards; the dots
 * and the arrows sit outside it.
 */
function cards(page: Page) {
  return rail(page).getByRole("list").getByRole("listitem");
}

function card(page: Page, title: string) {
  return cards(page).filter({ hasText: title });
}

/** The dots are labelled by the card they jump to. */
function dot(page: Page, title: string) {
  return rail(page).getByRole("button", { name: `Show ${title}`, exact: true });
}

test.describe("Snowdaes promo rail", () => {
  test("every card is present, in order", async ({ page }) => {
    await page.goto("/");
    /* Scoped to the list: the section's own "What's on right now" h2 also
       carries `font-display`. */
    const headings = await cards(page).locator(".font-display").allInnerTexts();
    expect(headings.map((h) => h.trim())).toEqual(CARDS);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: PHONE });

    test("dots are big enough to hit, and hitting near one still lands on it", async ({
      page,
    }) => {
      await page.goto("/");
      const first = dot(page, CARDS[0]);
      await first.scrollIntoViewIfNeeded();

      const box = await first.boundingBox();
      expect(box, "the dot must be laid out").not.toBeNull();

      /*
       * WCAG 2.5.8 asks for 24x24 CSS px. The regression this guards was a dot
       * whose button was exactly its 6px visual pill, so assert the BUTTON, not
       * the pill inside it.
       */
      expect.soft(box!.width, "dot hit width").toBeGreaterThanOrEqual(24);
      expect.soft(box!.height, "dot hit height").toBeGreaterThanOrEqual(24);

      /*
       * Size alone can still be a lie if something overlays it, so probe the
       * corners: what does the browser say is on top 8px off centre? Before the
       * fix this returned the section behind the dot.
       */
      const cx = box!.x + box!.width / 2;
      const cy = box!.y + box!.height / 2;
      const hits = await page.evaluate(
        ([x, y]) =>
          [-8, 0, 8].map((dy) => {
            const el = document.elementFromPoint(x, y + dy);
            return el ? !!el.closest("button[aria-label^='Show ']") : false;
          }),
        [cx, cy],
      );
      expect(hits, "8px above and below the dot's centre must still hit it").toEqual([
        true,
        true,
        true,
      ]);
    });

    test("tapping a dot moves the rail and marks that dot current", async ({ page }) => {
      await page.goto("/");
      const target = CARDS[2];
      const scroller = rail(page).locator("div.snap-x");

      const before = await scroller.evaluate((el) => el.scrollLeft);
      await dot(page, target).click();
      await expect(dot(page, target)).toHaveAttribute("aria-current", "true");
      await expect
        .poll(() => scroller.evaluate((el) => el.scrollLeft), {
          message: "the rail should have scrolled toward the chosen card",
        })
        .toBeGreaterThan(before);
    });

    test("the rail scrolls sideways but the page never does", async ({ page }) => {
      await page.goto("/");
      await dot(page, CARDS[4]).click();
      /* Let the smooth scroll settle before measuring the document. */
      await expect(dot(page, CARDS[4])).toHaveAttribute("aria-current", "true");

      const overflows = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflows, "the page body must not scroll horizontally").toBe(false);
    });

    test("the arrows are desktop-only", async ({ page }) => {
      await page.goto("/");
      await expect(rail(page).getByRole("button", { name: "Next" })).toBeHidden();
    });
  });

  test.describe("reduced motion", () => {
    test("tapping a dot jumps rather than animates", async ({ page }) => {
      /* `emulateMedia` rather than the `reducedMotion` test option: that option
         is not in this Playwright version's `PlaywrightTestOptions` type. */
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      const scroller = rail(page).locator("div.snap-x");
      await dot(page, CARDS[3]).click();

      /*
       * `globals.css` forces `scroll-behavior: auto` under reduced motion, but
       * CSSOM View says an explicit `behavior` argument to `scrollTo()` beats
       * the computed property — so a bare "smooth" animated anyway. Sample
       * across frames: an eased scroll produces many distinct positions, a jump
       * produces one or two.
       */
      const positions = await scroller.evaluate(
        (el) =>
          new Promise<number[]>((resolve) => {
            const seen: number[] = [];
            let frames = 0;
            const tick = () => {
              seen.push(el.scrollLeft);
              if (++frames < 20) requestAnimationFrame(tick);
              else resolve(seen);
            };
            requestAnimationFrame(tick);
          }),
      );

      const distinct = new Set(positions).size;
      expect(
        distinct,
        `reduced motion must not animate the rail (saw ${distinct} distinct scroll positions)`,
      ).toBeLessThanOrEqual(2);
    });
  });

  test("the active dot is right at every width, not just where the gap happens to match", async ({
    page,
  }) => {
    /*
     * Guards a real off-by-one. The step used to be a hardcoded
     * `{ base: 300 + 12, md: 336 + 20 }`, but the card grows at `md` (768px)
     * while the track gap grows at `sm` (640px) — so from 640 to 767 the true
     * step is 320px, the constant said 312, and `aria-current` landed one dot
     * early at the end of the rail. 700 is the width that catches it.
     */
    for (const width of [390, 700, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      const last = CARDS[CARDS.length - 1];
      await dot(page, last).click();
      await expect(
        dot(page, last),
        `the last dot should read as current at ${width}px`,
      ).toHaveAttribute("aria-current", "true");
    }
  });

  test("the arrows advance the rail on a desktop viewport", async ({ page }) => {
    await page.goto("/");
    const next = rail(page).getByRole("button", { name: "Next" });
    await expect(next).toBeVisible();

    /* First card selected means Previous has nothing to go back to. */
    await expect(rail(page).getByRole("button", { name: "Previous" })).toBeDisabled();

    await next.click();
    await expect(dot(page, CARDS[1])).toHaveAttribute("aria-current", "true");
  });

  test("Previous still works after scrolling all the way to the right", async ({ page }) => {
    /*
     * Reported from the live page: at the right-hand end of the rail, Previous
     * took the click and moved nothing.
     *
     * The arrows used to jump to `index * step`, and at the end `index` is
     * pinned to the last card even though the rail ran out of scroll long
     * before that card's own offset — at 1280px the track is 1824px in a
     * 1152px window, so scrollLeft maxes at 672 while index 4 wants 1424.
     * Previous asked for 1068, the browser clamped it back to the 672 it was
     * already at, and onScroll put the index straight back to 4.
     *
     * Asserted as "the rail moved left", not as an index: the index was never
     * the broken part, the scroll position was.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    const scroller = rail(page).locator("div.snap-x");
    const prev = rail(page).getByRole("button", { name: "Previous" });

    await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "auto" }));
    await expect(prev, "Previous must be offered at the end of the rail").toBeEnabled();

    const atEnd = await scroller.evaluate((el) => el.scrollLeft);
    expect(atEnd, "the rail should actually be at its right-hand end").toBeGreaterThan(0);

    await prev.click();
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollLeft), {
        message: "Previous must move the rail back, not sit there enabled and inert",
      })
      .toBeLessThan(atEnd);
  });

  test("Next is offered until the rail is genuinely at its end", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const scroller = rail(page).locator("div.snap-x");
    const next = rail(page).getByRole("button", { name: "Next" });

    await expect(next).toBeEnabled();
    await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth, behavior: "auto" }));
    await expect(next, "nothing left to advance to").toBeDisabled();
  });

  test("a card that names an item opens that item, not its category", async ({ page }) => {
    await page.goto("/");

    /*
     * Bring the card into view BEFORE reading scrollY. Playwright scrolls an
     * element into view as part of actionability, so measuring before the click
     * attributes Playwright's own 257px to the app and fails a passing page.
     */
    const trigger = card(page, "Thai Dye snow").getByRole("link");
    await trigger.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => window.scrollY);
    await trigger.click();

    /*
     * The drawer, not the grid. Thai Dye lives in Shaved Snow, which is also
     * the category the page opens on — so asserting "the grid moved" would pass
     * even if the card only jumped the rail. The dialog is the real signal.
     */
    /* `exact` matters: the drawer's own group headings are "Thai Dye Drizzle"
       and "Thai Dye Toppings", so a substring match finds three headings. */
    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByRole("heading", { name: "Thai Dye", exact: true }),
    ).toBeVisible();

    /*
     * And the page must not have moved under it. A smooth `scrollIntoView`
     * racing the sheet's mount landed somewhere different on every viewport,
     * and on a phone the sheet locks body scroll mid-animation.
     */
    expect(await page.evaluate(() => window.scrollY), "opening a card must not scroll the page").toBe(y);
  });

  test("opening from a card leaves the right category behind the drawer", async ({ page }) => {
    await page.goto("/");
    await card(page, "Pandan Mango Sticky Rice").getByRole("link").click();

    const drawer = page.getByRole("dialog");
    await expect(
      drawer.getByRole("heading", { name: "Pandan Mango Sticky Rice" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    /* Closing must not strand the customer on whatever category was selected
       before they tapped — Pandan Mango is a Specialty Drink. */
    await expect(
      page.getByRole("navigation", { name: "Menu categories" }).getByRole("button", {
        name: "Specialty Drinks",
      }),
    ).toHaveClass(/bg-primary/);
  });

  test("a card naming a category scrolls the grid into view", async ({ page }) => {
    /*
     * The regression this guards: category cards were briefly wired to the same
     * "set the category but do not scroll" path as item cards. That is correct
     * for an item — a drawer opens over the page and nothing needs bringing
     * into view — but for a category it changed something a full screen above
     * the fold, so "Six toppings, your call" looked like a dead link.
     */
    await page.goto("/");
    const six = card(page, "Six toppings, your call").getByRole("link");
    await six.scrollIntoViewIfNeeded();
    await six.click();

    const menuRail = page.getByRole("navigation", { name: "Menu categories" });
    await expect(menuRail.getByRole("button", { name: "Asian Ice" })).toHaveClass(
      /bg-primary/,
    );

    /* No drawer — this card is not an item. */
    await expect(page.getByRole("dialog")).toBeHidden();

    /* And the grid it selected has to actually be on screen. */
    const railTop = await menuRail.evaluate((el) => el.getBoundingClientRect().top);
    expect(
      railTop,
      "the category rail should be in view after a category card",
    ).toBeLessThan(200);
  });

  test("the in-store tote promo offers nothing to tap", async ({ page }) => {
    await page.goto("/");
    const tote = card(page, "Spend $25, take home a tote");
    await expect(tote).toBeVisible();

    /*
     * It is `while supplies last`, `in store only` — a customer who spends $25
     * online and gets no tote will ring the shop, and the shop will be right.
     * So the card must not be a control at all: not a button, not a disabled
     * button, which would still be announced as one.
     */
    expect(
      await tote.getByRole("button").count(),
      "the tote card must hold no control at all — not even a disabled one",
    ).toBe(0);
    /* And not a link either, now that the other four cards are anchors. */
    expect(
      await tote.getByRole("link").count(),
      "the tote card must not be a link — there is nothing on this site to link to",
    ).toBe(0);
    expect(
      await tote.locator("> div").evaluate((el) => el.tagName.toLowerCase()),
      "the tote card must render as a div, never a button",
    ).toBe("div");

    await expect(rail(page).getByText(/In-store purchases only/)).toBeVisible();
  });
});

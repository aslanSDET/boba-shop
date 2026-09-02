import { test, expect, type Page, type FrameLocator } from "@playwright/test";

/**
 * Asian Kitchen: menu → cart → checkout → paid, through the real Square card
 * form against the sandbox merchant.
 *
 * The card values are Square's own published sandbox numbers. They are not
 * anybody's card, they only work against `connect.squareupsandbox.com`, and
 * `SQUARE_ENV` defaults to sandbox with a guard that refuses production writes
 * outright (`pos/square/client.ts`).
 */

/** Square's documented sandbox values. 99999 is reserved to force an AVS failure. */
const CARD = {
  ok: "4111 1111 1111 1111",
  declined: "4000 0000 0000 0002",
  exp: "12/29",
  cvv: "111",
  postal: "94103",
};

/**
 * Square renders each field in its own cross-origin iframe, and they are not
 * labelled consistently enough to select by name. Locating by placeholder
 * inside the card container is the stable route.
 */
async function fillCard(page: Page, number: string) {
  const box = page.locator("#ak-card");
  await expect(box).toBeVisible();

  /* The SDK attaches asynchronously; the container exists before the iframe
     inside it does, so waiting on the container alone races. */
  const cardFrame: FrameLocator = box.frameLocator("iframe").first();
  const numberField = cardFrame.getByPlaceholder(/card number/i);
  await expect(numberField).toBeVisible({ timeout: 20_000 });

  await numberField.fill(number);
  await cardFrame.getByPlaceholder(/mm\s*\/\s*yy/i).fill(CARD.exp);
  await cardFrame.getByPlaceholder(/cvv/i).fill(CARD.cvv);

  /* Postal only appears for merchants whose country uses AVS. Filling it when
     absent must not fail the test, so it is probed rather than assumed. */
  const postal = cardFrame.getByPlaceholder(/zip|postal/i);
  if (await postal.count()) await postal.fill(CARD.postal);
}

async function addFirstItemAndGoToCheckout(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Combination Fried Rice/i }).first().click();
  await page.getByRole("button", { name: /Add to Order/i }).click();

  const cartBar = page.getByRole("link", { name: /Checkout/i });
  await expect(cartBar).toBeVisible();
  await cartBar.click();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
}

test.describe("Asian Kitchen checkout", () => {
  test("prices the cart with Square before anything is created", async ({ page }) => {
    await addFirstItemAndGoToCheckout(page);

    /* The label is the assertion: until Square answers, the page must say the
       number is an estimate. Invariant 4 — the POS is the calculator. */
    await expect(page.getByText(/Confirmed by Square at checkout/i)).toBeVisible();

    await expect(page.getByText("$12.49").first()).toBeVisible();
    /* Tax is Square's arithmetic, not ours: we send a 10% ORDER-scoped rate
       and Square returns the amount, including the rounding decision.
       $12.49 x 10% = $1.249 -> $1.25. The sandbox merchant has no TAX object of
       its own, which is why the rate has to be supplied at all. */
    await expect(page.getByRole("definition").filter({ hasText: /^\$1\.25$/ })).toBeVisible();
  });

  test("re-prices when the tip changes, without creating an order", async ({ page }) => {
    await addFirstItemAndGoToCheckout(page);
    /* Tip is taken on subtotal + tax = 1249 + 125 = 1374c.
       20% -> 275 -> 1649   none -> 1374   25% -> 344 -> 1718 */
    await expect(page.getByRole("button", { name: /Pay \$16\.49/ })).toBeVisible();

    await page.getByRole("button", { name: "None" }).click();
    await expect(page.getByRole("button", { name: /Pay \$13\.74/ })).toBeVisible();

    await page.getByRole("button", { name: "25%" }).click();
    await expect(page.getByRole("button", { name: /Pay \$17\.18/ })).toBeVisible();
  });

  test("takes a real sandbox payment and lands on the confirmation", async ({ page, request }) => {
    await addFirstItemAndGoToCheckout(page);

    await page.getByLabel("Name").fill("Playwright Test");
    await page.getByLabel("Mobile").fill("2055550143");
    await page.getByLabel("Email").fill("test@example.com");

    await fillCard(page, CARD.ok);

    const pay = page.getByRole("button", { name: /^Pay \$/ });
    await expect(pay).toBeEnabled();
    await pay.click();

    /* The URL is the proof: Square returned an order id and we routed to it. */
    await page.waitForURL(/\/order\/[A-Za-z0-9]+/, { timeout: 45_000 });

    /*
     * The confirmation number must be SQUARE'S, not one we derived.
     *
     * It used to be `AK-` + the last four characters of the order id, which
     * measured 162 distinct tickets across 229 real orders (67 collisions) and
     * existed only in the browser — the shop could never look it up. Square's
     * `receipt_number` is on the payment record and is the first four
     * characters of the payment id, which is the end that actually varies.
     *
     * Asserted against Square's own books rather than a shape: a regex like
     * /^[A-Za-z0-9]{4}$/ would pass just as happily on a number we made up.
     *
     * By role, not by text: Next renders a visually-hidden
     * `#__next-route-announcer__` carrying the same string for screen readers,
     * so a bare text match resolves to two elements and trips strict mode.
     */
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    const shown = (await heading.innerText()).trim();

    const orderId = new URL(page.url()).pathname.split("/").pop()!;
    const sq = {
      Authorization: `Bearer ${process.env.SQUARE_SANDBOX_ACCESS_TOKEN}`,
      "Square-Version": "2025-01-23",
    };

    /* GET by id, not orders/search: the search index is eventually consistent
       by several seconds — measured — and this runs immediately after paying. */
    const found = await request.get(
      `https://connect.squareupsandbox.com/v2/orders/${orderId}`,
      { headers: sq },
    );
    expect(found.ok(), await found.text()).toBeTruthy();
    const mine = (await found.json()).order;
    expect(mine, "the order we just paid should be on the merchant's books").toBeTruthy();

    const tenderId = mine.tenders?.[0]?.id;
    expect(tenderId, "a paid order carries a tender").toBeTruthy();
    const payment = await request.get(
      `https://connect.squareupsandbox.com/v2/payments/${tenderId}`,
      { headers: sq },
    );
    const receiptNumber = (await payment.json()).payment?.receipt_number;

    expect(receiptNumber, "Square issues a receipt_number on a COMPLETED payment").toBeTruthy();
    expect(
      shown,
      `the confirmation shows "${shown}" but Square's receipt number is "${receiptNumber}"`,
    ).toBe(receiptNumber);
    /* And it is not the old derived shape. */
    expect(shown.startsWith("AK-")).toBe(false);
    await expect(page.getByText(/Show this number at the counter/i)).toBeVisible();
    await expect(page.getByText(/Combination Fried Rice/i)).toBeVisible();

    /* The map belongs HERE and only here — directions are what you want once
       the order is placed and you are on your way to collect it. The checkout's
       own test asserts the other half, that it is absent there. */
    await expect(page.getByRole("link", { name: /Open in Maps/i })).toBeVisible();
    await expect(page.locator("iframe.ak-co-mapframe")).toBeVisible();
  });

  test("a declined card says so, and does not blame the network", async ({ page }) => {
    await addFirstItemAndGoToCheckout(page);
    /* Name AND a contact: the Pay button is now gated on both, which is the
       point of the validation and was worth the test noticing. */
    await page.getByLabel("Name").fill("Declined Test");
    await page.getByLabel("Mobile").fill("2055550143");

    await fillCard(page, CARD.declined);
    await page.getByRole("button", { name: /^Pay \$/ }).click();

    /* The specific thing being asserted is the ABSENCE of the connectivity
       message. A decline reported as "could not reach the shop" sends the
       customer to check their wifi instead of their card — which is what this
       page did until it was caught by hand. */
    /* Scoped to main for the same reason the ticket is matched by role: the
       route announcer is also role="alert", and it lives outside <main>. */
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 45_000 });
    await expect(alert).not.toContainText(/could not reach the shop/i);
    await expect(alert).toContainText(/declin/i);

    await expect(page).toHaveURL(/\/checkout/);
  });

  /**
   * The retry after a decline — the single most likely thing a real customer
   * does on this page, and it was broken.
   *
   * The idempotency key was minted once per page mount while `card.tokenize()`
   * mints a new single-use nonce on every press, so the second Pay sent the same
   * key with a different `source_id` and Square answered
   *
   *   IDEMPOTENCY_KEY_REUSED
   *   "Different request parameters used for the same idempotency_key"
   *
   * The customer was told their card was declined, corrected it, and got an
   * internal-sounding error for their trouble — with no way forward except a
   * reload they had no reason to guess at.
   *
   * Driven through the UI rather than the API on purpose: the bug lived in how
   * the page reused a value across two presses, which is invisible to a test
   * that constructs each request itself.
   */
  test("a declined card can be corrected and paid on the same page", async ({ page }) => {
    await addFirstItemAndGoToCheckout(page);

    await page.getByLabel("Name").fill("Retry Test");
    await page.getByLabel("Mobile").fill("2055550143");

    await fillCard(page, CARD.declined);
    await page.getByRole("button", { name: /^Pay \$/ }).click();

    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 45_000 });
    await expect(alert).toContainText(/declin/i);

    /* Now do exactly what a customer does: type a card that works, press Pay. */
    await fillCard(page, CARD.ok);
    await page.getByRole("button", { name: /^Pay \$/ }).click();

    await page.waitForURL(/\/order\/[A-Za-z0-9]+/, { timeout: 45_000 });
    await expect(page.getByText(/Show this number at the counter/i)).toBeVisible();

    /* The specific regression: the second attempt must not be refused for
       reusing the first attempt's key. */
    await expect(page.locator("main")).not.toContainText(/idempotency/i);
  });

  test("an empty cart offers a way back rather than a broken page", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: /Your order is empty/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to the menu/i })).toBeVisible();
  });
});

/**
 * The regression guard for the bug that was hardest to see.
 *
 * `createOrderAndPay` used to charge `total_money`, which Square rewrites once
 * a payment lands: the SAME order reads 1249 before and 1499 after, because the
 * tip is folded in. A retry therefore sent a different amount under the same
 * idempotency key and Square refused it with IDEMPOTENCY_KEY_REUSED — so a
 * customer retrying after a lost response got an error instead of their order,
 * which is the precise failure idempotency exists to prevent.
 *
 * Driven through the API rather than the UI on purpose: the Pay button disables
 * itself while a payment is in flight, so the interesting case — the same
 * request arriving twice — cannot be produced by clicking.
 */
test.describe("payment idempotency", () => {
  test("replaying a checkout returns the same order and charges once", async ({ request }) => {
    const key = crypto.randomUUID();
    expect(key.length, "a bare UUID must fit Square's 45-char payment key limit").toBeLessThanOrEqual(45);

    const body = {
      lines: [{ itemId: "h-comborice", picks: [] }],
      tipCents: 250,
      sourceId: "cnon:card-nonce-ok",
      idempotencyKey: key,
      customer: { name: "Idempotency Test", phone: "2055550143" },
    };

    const first = await request.post("/api/square/pay", { data: body });
    expect(first.ok(), await first.text()).toBeTruthy();
    const a = await first.json();

    const second = await request.post("/api/square/pay", { data: body });
    expect(second.ok(), await second.text()).toBeTruthy();
    const b = await second.json();

    expect(b.orderId).toBe(a.orderId);
    expect(b.paymentId).toBe(a.paymentId);
    expect(b.priced.totalCents).toBe(a.priced.totalCents);
  });

  test("rejects an over-long idempotency key by name, not by Square's anonymous error", async ({ request }) => {
    const res = await request.post("/api/square/pay", {
      data: {
        lines: [{ itemId: "h-comborice", picks: [] }],
        sourceId: "cnon:card-nonce-ok",
        idempotencyKey: `far-too-long-${crypto.randomUUID()}`,
        customer: { name: "Key Length Test", phone: "2055550143" },
      },
    });
    expect(res.status()).toBe(400);
    /* Square answers VALUE_TOO_LONG naming no field. Ours names the field and
       the limit, which is the difference between a five-minute fix and an hour. */
    expect((await res.json()).error).toMatch(/idempotencyKey.*45/i);
  });
});

/**
 * A declined card must not leave an order behind.
 *
 * The order is created before the payment is attempted, so a decline strands
 * it: OPEN on the merchant's account, with a FAILED tender and no money. Three
 * of those accumulated on the sandbox merchant from earlier runs of the decline
 * test, which is how the gap was found — the same litter Clover produced, in a
 * smaller window.
 */
test("a declined payment cancels the order it created", async ({ request }) => {
  /* A DELTA, not an absolute count. Asserting "no stranded orders exist"
     fails on litter from before this guard existed, which says nothing about
     whether the guard works. What matters is that this decline adds none. */
  const strandedCount = async () => {
    const search = await request.post(
      "https://connect.squareupsandbox.com/v2/orders/search",
      {
        headers: {
          "Square-Version": "2025-01-23",
          Authorization: `Bearer ${process.env.SQUARE_SANDBOX_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        data: {
          location_ids: [process.env.SQUARE_TEST_LOCATION_ID ?? "LA5YVEHPBFX7Y"],
          query: { filter: { state_filter: { states: ["OPEN"] } } },
          limit: 100,
        },
      },
    );
    const orders = (await search.json()).orders ?? [];
    return orders.filter(
      (o: { tenders?: Array<{ card_details?: { status?: string } }> }) =>
        (o.tenders ?? []).length > 0 &&
        (o.tenders ?? []).every((t) => t.card_details?.status === "FAILED"),
    ).length;
  };

  const before = await strandedCount();

  const res = await request.post("/api/square/pay", {
    data: {
      lines: [{ itemId: "h-comborice", picks: [] }],
      sourceId: "cnon:card-nonce-declined",
      idempotencyKey: crypto.randomUUID(),
      customer: { name: "Decline Cleanup Test", phone: "2055550143" },
    },
  });

  expect(res.ok(), "a declined card must not return 2xx").toBeFalsy();
  const body = await res.json();
  expect(body.error).toMatch(/declin/i);

  /*
   * `expect.poll`, not a bare read.
   *
   * Square's `orders/search` is eventually consistent — measured: it reported
   * orders as OPEN that an authoritative GET showed CANCELED, several seconds
   * apart. A single read straight after a write is therefore a coin toss, and
   * this test duly passed alone and failed in a full run where other tests had
   * just written.
   *
   * Polling asserts what is actually meant — that the count SETTLES back — and
   * still fails, after the timeout, if an order is genuinely stranded.
   */
  /*
   * Not-greater-than, not equality.
   *
   * The count can legitimately go DOWN mid-test: the cleanup retries after a
   * 400ms delay, so a previous decline's sweep can land while this one polls,
   * and Square's search index catches up on its own schedule. Asserting
   * equality failed with "expected 1, received 0" — a cleaner sandbox reported
   * as a regression.
   *
   * The actual requirement is only ever one direction: this decline must not
   * ADD a stranded order.
   */
  await expect
    .poll(strandedCount, {
      timeout: 20_000,
      message: "the decline must not leave an order OPEN with only a FAILED tender",
    })
    .toBeLessThanOrEqual(before);
});

/**
 * The hardening, proved.
 *
 * `POST /api/square/pay` is unauthenticated and creates real objects on a real
 * merchant's account, so "the browser will only send sensible values" is not a
 * posture. Each case below is a thing the browser could send and previously
 * would have been believed.
 */
test.describe("request hardening", () => {
  const good = {
    lines: [{ itemId: "h-comborice", picks: [] }],
    sourceId: "cnon:card-nonce-ok",
    customer: { name: "Hardening Test", phone: "2055550143" },
  };

  const post = (request: import("@playwright/test").APIRequestContext, data: object) =>
    request.post("/api/square/pay", {
      data: { ...good, idempotencyKey: crypto.randomUUID(), ...data },
    });

  test("a NEGATIVE tip is refused — it would have cut the charge below the food price", async ({ request }) => {
    const res = await post(request, { tipCents: -5000 });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/negative/i);
  });

  test("an absurd tip is refused", async ({ request }) => {
    const res = await post(request, { tipCents: 99_999_999 });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/too large/i);
  });

  test("a fractional tip is refused", async ({ request }) => {
    const res = await post(request, { tipCents: 12.5 });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/whole number/i);
  });

  test("a cart of ten thousand lines is refused before it reaches Square", async ({ request }) => {
    const res = await post(request, {
      lines: Array.from({ length: 10_000 }, () => ({ itemId: "h-comborice", picks: [] })),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/at most/i);
  });

  test("an enormous quantity is refused", async ({ request }) => {
    const res = await post(request, {
      lines: [{ itemId: "h-comborice", picks: [], quantity: 1_000_000 }],
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/quantity/i);
  });

  test("a missing name is refused, because the counter has nothing to call", async ({ request }) => {
    const res = await post(request, { customer: { phone: "2055550143" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/name/i);
  });

  test("a name with no way to reach them is refused", async ({ request }) => {
    const res = await post(request, { customer: { name: "No Contact" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/mobile.*email|email.*mobile/i);
  });

  test("either a mobile OR an email is enough — not both", async ({ request }) => {
    const withEmail = await post(request, {
      customer: { name: "Email Only", email: "someone@example.com" },
    });
    expect(withEmail.ok(), await withEmail.text()).toBeTruthy();
  });

  test("a malformed email is refused", async ({ request }) => {
    const res = await post(request, { customer: { name: "Bad Email", email: "not-an-email" } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
  });
});

/** The map is a real element with a real accessible name, not a decorative box. */
/*
 * The map moved to the confirmation, and this asserts BOTH halves of that.
 *
 * At checkout the customer has already chosen where they are going and is
 * trying to pay; the map is a third-party iframe pushing the card form down a
 * phone screen. Directions are what you want after the order is placed. Only
 * asserting its absence would let it silently disappear from BOTH screens, so
 * "takes a real sandbox payment and lands on the confirmation" above pins where
 * it went — the two assertions have to move together.
 */
test("the checkout does NOT carry the map — the address is stated instead", async ({
  page,
}) => {
  await addFirstItemAndGoToCheckout(page);

  await expect(page.locator("iframe.ak-co-mapframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Open in Maps/i })).toHaveCount(0);

  /* The pickup address is still on the page; it is the map that went. */
  await expect(page.getByText(/Pickup at .*Center Point/i)).toBeVisible();
});

/**
 * The light validation: enough to catch a slip, not enough to argue with a real
 * customer. A missed digit is the common mistake on a phone keypad, so the
 * message counts what is missing rather than just refusing.
 */
test.describe("contact validation", () => {
  const base = {
    lines: [{ itemId: "h-comborice", picks: [] }],
    sourceId: "cnon:card-nonce-ok",
  };
  const post = (r: import("@playwright/test").APIRequestContext, customer: object) =>
    r.post("/api/square/pay", {
      data: { ...base, idempotencyKey: crypto.randomUUID(), customer },
    });

  test("a phone one digit short is refused, and says so", async ({ request }) => {
    const res = await post(request, { name: "Short Number", phone: "(205) 555-014" });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/1 digit short/i);
  });

  test("a ten-digit number is accepted however it is punctuated", async ({ request }) => {
    for (const phone of ["(205) 555-0143", "205-555-0143", "2055550143", "+1 205 555 0143"]) {
      const res = await post(request, { name: "Punctuation", phone });
      expect(res.ok(), `${phone} -> ${await res.text()}`).toBeTruthy();
    }
  });

  test("an email with no TLD is refused", async ({ request }) => {
    const res = await post(request, { name: "No TLD", email: "someone@gmail" });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/typo|missing/i);
  });

  test("plus-addressing is accepted — real people use it", async ({ request }) => {
    const res = await post(request, { name: "Plus", email: "yusuf+ak@example.co.uk" });
    expect(res.ok(), await res.text()).toBeTruthy();
  });

  test("the checkout masks a number as it is typed", async ({ page }) => {
    await addFirstItemAndGoToCheckout(page);
    const phone = page.getByLabel("Mobile");

    /* Typed one key at a time, not filled: the mask runs on every keystroke and
       filling would bypass the thing under test. */
    await phone.pressSequentially("2055550143");
    await expect(phone).toHaveValue("(205) 555-0143");
    await phone.blur();
    await expect(page.locator("#ak-err-phone")).toHaveCount(0);
  });

  test("an incomplete number says how many digits are missing", async ({ page }) => {
    await addFirstItemAndGoToCheckout(page);
    const phone = page.getByLabel("Mobile");

    await phone.pressSequentially("205555014");
    /* Nine digits is visibly the wrong shape — which is the whole point of
       masking, and is what a bare "2055550143" can never show. */
    await expect(phone).toHaveValue("(205) 555-014");
    await phone.blur();
    await expect(page.locator("#ak-err-phone")).toHaveText(/1 more digit/i);

    /*
     * Re-focusing puts the caret at position 0, so appending needs an explicit
     * End first — otherwise the keystroke lands at the front and (205) 555-014
     * becomes (320) 555-5014. Browser behaviour rather than the mask's doing,
     * and worth writing down because it looks exactly like a formatter bug.
     */
    await phone.focus();
    await phone.press("End");
    await phone.pressSequentially("3");
    await expect(phone).toHaveValue("(205) 555-0143");
    await expect(page.locator("#ak-err-phone")).toHaveCount(0);
  });
});

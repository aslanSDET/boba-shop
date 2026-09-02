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
    /* Tax is $0.00 because the sandbox merchant has no TAX catalog object.
       That is the sandbox being empty, not our arithmetic. */
    await expect(page.getByRole("definition").filter({ hasText: /^\$0\.00$/ })).toBeVisible();
  });

  test("re-prices when the tip changes, without creating an order", async ({ page }) => {
    await addFirstItemAndGoToCheckout(page);
    await expect(page.getByRole("button", { name: /Pay \$14\.99/ })).toBeVisible();

    await page.getByRole("button", { name: "None" }).click();
    await expect(page.getByRole("button", { name: /Pay \$12\.49/ })).toBeVisible();

    await page.getByRole("button", { name: "25%" }).click();
    await expect(page.getByRole("button", { name: /Pay \$15\.61/ })).toBeVisible();
  });

  test("takes a real sandbox payment and lands on the confirmation", async ({ page }) => {
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

    /* By role, not by text: Next renders a visually-hidden
       `#__next-route-announcer__` carrying the same string for screen readers,
       so a bare text match resolves to two elements and trips strict mode. */
    await expect(page.getByRole("heading", { name: /^AK-/ })).toBeVisible();
    await expect(page.getByText(/Show this number at the counter/i)).toBeVisible();
    await expect(page.getByText(/Combination Fried Rice/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Open in Maps/i })).toBeVisible();
  });

  test("a declined card says so, and does not blame the network", async ({ page }) => {
    await addFirstItemAndGoToCheckout(page);
    await page.getByLabel("Name").fill("Declined Test");

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
      note: "Idempotency Test",
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
      note: "Decline cleanup test",
    },
  });

  expect(res.ok(), "a declined card must not return 2xx").toBeFalsy();
  const body = await res.json();
  expect(body.error).toMatch(/declin/i);

  /* The order is not named in the error — deliberately, since the customer has
     no use for it — so the assertion is on the merchant's books instead. */
  const after = await strandedCount();
  expect(after, "the decline must not add an order left OPEN with a FAILED tender").toBe(before);
});

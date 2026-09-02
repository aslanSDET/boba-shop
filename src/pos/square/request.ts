/**
 * Everything the browser sends, checked before it reaches Square.
 *
 * ── WHY THIS IS A SEPARATE FILE AND NOT A FEW `if`s IN THE ROUTE ─────────────
 *
 * `POST /api/square/pay` is unauthenticated and creates real objects on a real
 * merchant's account. There is no session, no login and no rate limit in front
 * of it — the same shape as the Clover checkout route, and the reason both
 * deployments sit behind basic auth while this is a demo.
 *
 * Given that, "the browser will only ever send sensible values" is not a
 * security posture, it is a hope. Every field below is bounded, and the bounds
 * are stated rather than implied.
 *
 * ── THE ONE THAT ACTUALLY MATTERS ────────────────────────────────────────────
 *
 * **`tipCents` was unbounded.** It travels from the browser into Square's
 * `tip_money` untouched, so a negative tip reduced the charge below the price
 * of the food, and a fractional one produced a total nobody could reconcile.
 * The food price cannot be tampered with — that comes back from Square, and the
 * browser only ever sends item ids — but the tip was a hole straight through
 * the middle of it.
 *
 * Everything else here is denial-of-service hygiene: a cart of ten thousand
 * lines, a quantity of a million, a name the length of a novel. None of them
 * steal money; all of them waste a merchant's API quota and a Lambda's time.
 */

export interface CartLineInput {
  itemId: string;
  picks: string[];
  quantity?: number;
}

export interface CheckoutRequest {
  lines: CartLineInput[];
  tipCents?: number;
}

/** Who is collecting, and how the shop reaches them if something is wrong. */
export interface CustomerInput {
  name: string;
  phone?: string;
  email?: string;
}

export class RequestError extends Error {}

/* Bounds. Generous enough that no real order touches them, tight enough that
   nothing absurd gets through. A real cart here is one or two plates. */
const MAX_LINES = 50;
const MAX_QUANTITY = 25;
const MAX_PICKS_PER_LINE = 30;
/** $1,000. Above this it is a typo or an attack, not a tip. */
const MAX_TIP_CENTS = 100_000;
const MAX_NAME = 80;
const MAX_PHONE = 25;
const MAX_EMAIL = 254; // RFC 5321

function str(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new RequestError(`${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new RequestError(`${field} must be ${max} characters or fewer.`);
  return trimmed;
}

export function parseCheckoutRequest(input: unknown): CheckoutRequest {
  if (!input || typeof input !== "object") throw new RequestError("Expected a JSON body.");
  const body = input as Record<string, unknown>;

  if (!Array.isArray(body.lines)) throw new RequestError("The cart is missing.");
  if (body.lines.length === 0) throw new RequestError("The cart is empty.");
  if (body.lines.length > MAX_LINES) {
    throw new RequestError(`An order may have at most ${MAX_LINES} lines.`);
  }

  const lines: CartLineInput[] = body.lines.map((raw, i) => {
    if (!raw || typeof raw !== "object") throw new RequestError(`Line ${i + 1} is not valid.`);
    const line = raw as Record<string, unknown>;

    if (typeof line.itemId !== "string" || !line.itemId) {
      throw new RequestError(`Line ${i + 1} has no item.`);
    }

    const picks = line.picks ?? [];
    if (!Array.isArray(picks)) throw new RequestError(`Line ${i + 1} has invalid options.`);
    if (picks.length > MAX_PICKS_PER_LINE) {
      throw new RequestError(`Line ${i + 1} has too many options.`);
    }
    if (!picks.every((p) => typeof p === "string" && p)) {
      throw new RequestError(`Line ${i + 1} has an invalid option.`);
    }

    let quantity = 1;
    if (line.quantity !== undefined) {
      if (typeof line.quantity !== "number" || !Number.isFinite(line.quantity)) {
        throw new RequestError(`Line ${i + 1} has an invalid quantity.`);
      }
      quantity = Math.floor(line.quantity);
      if (quantity < 1 || quantity > MAX_QUANTITY) {
        throw new RequestError(`Quantity must be between 1 and ${MAX_QUANTITY}.`);
      }
    }

    return { itemId: line.itemId, picks: picks as string[], quantity };
  });

  let tipCents = 0;
  if (body.tipCents !== undefined && body.tipCents !== null) {
    if (typeof body.tipCents !== "number" || !Number.isFinite(body.tipCents)) {
      throw new RequestError("The tip is not a number.");
    }
    if (!Number.isInteger(body.tipCents)) {
      throw new RequestError("The tip must be a whole number of cents.");
    }
    /* Negative is the one that costs money, so it is called out separately —
       a message saying "between 0 and 100000" reads like a typo, and this one
       is worth being able to find in a log. */
    if (body.tipCents < 0) throw new RequestError("The tip cannot be negative.");
    if (body.tipCents > MAX_TIP_CENTS) throw new RequestError("That tip is too large.");
    tipCents = body.tipCents;
  }

  return { lines, tipCents };
}

/**
 * A name, and at least one way to reach them.
 *
 * The name is not optional: without it there is nothing to call out when the
 * bag is on the counter, and "Online order" on every ticket is the same as no
 * ticket. Contact is one-of rather than both — insisting on an email from
 * someone who only wants an SMS is a form field that costs orders and buys
 * nothing.
 */
export function parseCustomer(input: unknown): CustomerInput {
  const body = (input ?? {}) as Record<string, unknown>;

  const name = str(body.name ?? "", "Name", MAX_NAME);
  if (!name) throw new RequestError("A name is needed so we can call the order.");

  const phone = body.phone ? str(body.phone, "Mobile", MAX_PHONE) : "";
  const email = body.email ? str(body.email, "Email", MAX_EMAIL) : "";

  if (!phone && !email) {
    throw new RequestError("Add a mobile number or an email so the shop can reach you.");
  }

  /* Deliberately loose. Strict phone and email validation rejects real people —
     `+44`, extensions, plus-addressing, new TLDs — and the cost of a wrong
     address here is one unsent receipt, not a wrong charge. Enough shape to
     catch a slip, not enough to argue with a customer. */
  if (phone) {
    /*
     * Ten digits for a US number, and the checkout masks to exactly that. The
     * old floor of seven let a number through with three digits missing, which
     * is a number the shop cannot call.
     *
     * Longer is allowed rather than rejected: 11 digits beginning 1 is the same
     * number with the country code, and 11-15 is an international one. This is
     * a Birmingham takeout counter so those are rare, but rejecting a real
     * customer to enforce a format is the wrong trade — the shop can dial it
     * either way.
     */
    const digits = phone.replace(/\D/g, "");
    const normalised = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (normalised.length < 10) {
      const missing = 10 - normalised.length;
      throw new RequestError(
        `That mobile number is ${missing} digit${missing === 1 ? "" : "s"} short.`,
      );
    }
    if (normalised.length > 15) {
      throw new RequestError("That mobile number has too many digits.");
    }
  }
  /* A dot and at least two characters after it, which catches `you@gmail` and
     a trailing-dot slip without arguing with anyone's real address. */
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new RequestError("That email is missing something — check for a typo.");
  }

  return { name, phone: phone || undefined, email: email || undefined };
}

/** What goes on the ticket the kitchen reads. */
export function ticketLabel(c: CustomerInput): string {
  return [c.name, c.phone].filter(Boolean).join(" · ").slice(0, 100);
}

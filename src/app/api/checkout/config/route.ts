import { CLOVER_ENV, ecomm, merchantId } from "@/lib/clover";

/**
 * The three values the browser needs to tokenise a card, and nothing else.
 *
 * ── WHY THIS KEY IS SAFE TO HAND OUT, AND THE ROUTE STILL ISN'T OPEN ─────────
 *
 * Clover's PAKMS key tokenises and *cannot charge*. It is designed to sit in a
 * browser, which is the whole point: the card goes from the customer into
 * Clover's iframe and back as a `clv_` token, and our server never sees a PAN.
 * The private key and the merchant API token stay server-side and are not in
 * this response.
 *
 * It is still fetched at request time rather than pasted into `.env.local` as a
 * second secret — `GET /pakms/apikey` on the Ecommerce host returns it in
 * exchange for the private key we already hold, so there is one fewer
 * credential for anyone to copy into the wrong place.
 *
 * The route is deliberately not cached at the CDN. The key is per-merchant, and
 * once this serves two locations the wrong cached key would tokenise a card
 * against the wrong shop.
 */
export const dynamic = "force-dynamic";

interface PakmsResponse {
  apiAccessKey?: string;
  active?: boolean;
}

export async function GET() {
  let mId: string;
  try {
    mId = merchantId();
  } catch {
    return Response.json(
      { error: "Clover is not configured on this deployment." },
      { status: 503 },
    );
  }

  let key: PakmsResponse;
  try {
    key = await ecomm<PakmsResponse>("/pakms/apikey");
  } catch {
    // Deliberately vague to the browser; the detail is in the server log.
    return Response.json({ error: "Could not reach Clover." }, { status: 502 });
  }

  if (!key.apiAccessKey || key.active === false) {
    return Response.json(
      { error: "This merchant has no active tokenisation key." },
      { status: 502 },
    );
  }

  return Response.json({
    /** Tokenises only. Cannot move money. */
    publicKey: key.apiAccessKey,
    merchantId: mId,
    environment: CLOVER_ENV,
    /** Where the browser loads Clover's SDK from — it differs per environment. */
    sdkUrl:
      CLOVER_ENV === "production"
        ? "https://checkout.clover.com/sdk.js"
        : "https://checkout.sandbox.dev.clover.com/sdk.js",
  });
}

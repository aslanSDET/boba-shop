import { RESTAURANT } from "./config";

/**
 * The shop, on a map, above everything else on the checkout.
 *
 * ── NO API KEY, DELIBERATELY ─────────────────────────────────────────────────
 *
 * Google's Embed API (`/maps/embed/v1/place`) needs a key — it answers 401
 * without one, measured. The older `maps.google.com/maps?q=…&output=embed`
 * needs nothing: it 301s to `google.com/maps/embed` and returns a working map,
 * also measured.
 *
 * That matters beyond convenience. A key would have to be restricted by HTTP
 * referrer, rotated, and kept out of a public repo, and it would be visible in
 * the page source anyway. For "show where the shop is", a keyless embed has no
 * downside worth that.
 *
 * If this ever needs styling, markers, or directions, that is the moment to buy
 * a key — not before.
 *
 * ── WHAT EMBEDDING GOOGLE COSTS ──────────────────────────────────────────────
 *
 * A third-party iframe that sets Google's cookies. Two mitigations, neither
 * complete: `loading="lazy"` so it costs nothing until scrolled near, which on
 * a phone-first page also keeps it off the critical path; and
 * `referrerPolicy="no-referrer-when-downgrade"`, which is what Google itself
 * documents.
 *
 * The plain link is not a fallback, it is the primary action. Someone on a
 * phone wants turn-by-turn in their own maps app, not a small rectangle to
 * pinch — so the link works whether or not the iframe ever loads, including
 * when an extension or a strict CSP blocks it.
 */
export function PickupMap() {
  const query = encodeURIComponent(RESTAURANT.address);

  return (
    <section className="ak-co-map" aria-labelledby="ak-map-h">
      <h2 id="ak-map-h" className="ak-co-h">
        Pickup location
      </h2>

      <iframe
        className="ak-co-mapframe"
        /* A title, not aria-label: an iframe with no accessible name is
           announced as "frame" and nothing else. */
        title={`Map showing ${RESTAURANT.name}, ${RESTAURANT.address}`}
        src={`https://maps.google.com/maps?q=${query}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />

      <p className="ak-co-addr">{RESTAURANT.address}</p>
      <a
        className="ak-co-maplink"
        href={`https://maps.google.com/?q=${query}`}
        target="_blank"
        rel="noreferrer noopener"
      >
        Open in Maps →
      </a>
    </section>
  );
}

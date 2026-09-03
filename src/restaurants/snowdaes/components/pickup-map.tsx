import { LOCATIONS } from "@/restaurants/snowdaes/shop";

/**
 * Where to collect the order, on a map.
 *
 * ── NO API KEY, DELIBERATELY ─────────────────────────────────────────────────
 *
 * Google's Embed API (`/maps/embed/v1/place`) needs a key — it answers 401
 * without one. The older `maps.google.com/maps?q=…&output=embed` needs nothing:
 * it 301s to `google.com/maps/embed` and returns a working map.
 *
 * That matters beyond convenience. A key would have to be restricted by HTTP
 * referrer, rotated, and kept out of a public repo, and it would be visible in
 * the page source anyway. For "show where the shop is", a keyless embed has no
 * downside worth that. If this ever needs styling, markers or directions, that
 * is the moment to buy a key — not before.
 *
 * ── WHAT EMBEDDING GOOGLE COSTS ──────────────────────────────────────────────
 *
 * A third-party iframe that sets Google's cookies. Two mitigations, neither
 * complete: `loading="lazy"`, so it costs nothing until scrolled near — which
 * on a phone-first page also keeps it off the critical path; and
 * `referrerPolicy="no-referrer-when-downgrade"`, which is what Google itself
 * documents.
 *
 * The plain links are not a fallback, they are the primary action. Someone on a
 * phone wants turn-by-turn in their own maps app, and a phone number they can
 * press — not a small rectangle to pinch. Both work whether or not the iframe
 * ever loads, including when an extension or a strict CSP blocks it.
 *
 * ── WHY IT IS ON THE CONFIRMATION AND NOT THE CHECKOUT ───────────────────────
 *
 * At checkout the customer has already decided where they are going and is
 * trying to pay; a large third-party paint there pushes the card form down the
 * screen. Directions are what you want AFTER the order is placed, on the way to
 * collect it. The address itself is still stated at checkout, in the pickup row.
 */
export function PickupMap({ locationId }: { locationId: string }) {
  const location = LOCATIONS.find((l) => l.id === locationId) ?? LOCATIONS[0];
  const address = `Snowdaes, ${location.street}, ${location.cityLine}`;
  const query = encodeURIComponent(address);

  return (
    <section
      className="overflow-hidden rounded-3xl border border-border bg-card"
      aria-labelledby="pickup-map-heading"
    >
      <h2
        id="pickup-map-heading"
        className="border-b border-border px-5 py-4 font-display text-[19px] font-semibold"
      >
        Where to collect it
      </h2>

      <iframe
        /* A title, not aria-label: an iframe with no accessible name is
           announced as "frame" and nothing else. */
        title={`Map showing Snowdaes, ${location.street}, ${location.cityLine}`}
        src={`https://maps.google.com/maps?q=${query}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block h-[220px] w-full border-0"
      />

      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-[15px] leading-relaxed">
          <span className="font-semibold">{location.street}</span>
          <span className="block text-muted-foreground">{location.cityLine}</span>
        </p>

        <div className="flex flex-wrap gap-2.5">
          <a
            href={`https://maps.google.com/?q=${query}`}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-full bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
          >
            Open in Maps
          </a>
          <a
            href={`tel:${location.phone.replace(/[^0-9+]/g, "")}`}
            className="rounded-full border border-border px-5 py-3 text-[15px] font-medium transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink"
          >
            Call {location.phone}
          </a>
        </div>
      </div>
    </section>
  );
}

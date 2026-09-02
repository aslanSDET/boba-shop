import { Star } from "lucide-react";
import { TESTIMONIALS } from "@/restaurants/snowdaes/shop";

export function Testimonials() {
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="border-t border-border bg-card"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        {/*
          PLACEHOLDER MARKER — every quote in this band is invented (see the
          header on TESTIMONIALS in shop.ts).

          The comment in shop.ts is the right place to warn a developer and the
          wrong place to warn the shop owner, who is reading the deployed page
          and not the source. Until real permissioned reviews replace them, the
          page has to say so itself: three fabricated customers quoted by name
          and town, under a real business at a real address, is worse than an
          empty band.

          Delete this marker in the same change that puts real reviews in
          shop.ts — not before, and not separately.
        */}
        <p className="mx-auto flex w-fit items-center rounded-full border border-dashed border-brand-ink/60 px-3 py-1 font-mono text-[11px] tracking-[0.12em] text-brand-ink uppercase">
          Placeholder — sample layout, not real reviews
        </p>
        <p className="mt-4 text-center font-mono text-[11px] tracking-[0.2em] text-brand-ink uppercase">
          Since 2013
        </p>
        <h2
          id="testimonials-heading"
          className="mx-auto mt-4 max-w-[18ch] text-center font-display text-[2.25rem] leading-[1.05] font-semibold text-balance sm:text-[3rem]"
        >
          Two shops, one very loyal crowd
        </h2>

        <ul className="mt-12 grid gap-5 md:grid-cols-3 sm:gap-6">
          {TESTIMONIALS.map((t) => (
            <li
              key={t.id}
              className="flex flex-col rounded-3xl border border-border bg-background p-6 sm:p-7"
            >
              <div className="flex gap-0.5 text-primary" aria-label="5 out of 5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className="size-4 fill-current" />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-foreground sm:text-base">
                “{t.quote}”
              </blockquote>
              <cite className="mt-5 block border-t border-border pt-4 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase not-italic">
                {/* Repeated per card, not just on the band marker above: on a
                    phone the three cards fill the viewport on their own and the
                    marker is scrolled off, which is exactly the moment an
                    invented name reads as a real customer. */}
                <span className="text-brand-ink">Sample</span> · {t.name} · {t.city}
              </cite>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";

interface Promo {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  /** Cut-outs float; full-frame shots get cropped into the corner. */
  fit: "contain" | "cover";
  tint: string;
  /** Category to jump to, or "locations" to scroll to the footer. */
  target: string;
  cta: string;
}

const PROMOS: Promo[] = [
  {
    id: "billerica",
    eyebrow: "Now open",
    title: "Billerica is serving",
    body: "Our second shop on Chelmsford Rd, same menu, shorter line.",
    image: "/brand/snowdaes-mark.png",
    fit: "contain",
    tint: "#f5901e",
    target: "locations",
    cta: "Get directions",
  },
  {
    id: "thai-dye",
    eyebrow: "Fan favourite",
    title: "Thai Dye snow",
    body: "Thai tea snow, rainbow mochi, Fruity Pebbles, condensed milk.",
    image: "/menu/thai-dye-snow.jpg",
    fit: "cover",
    tint: "#e07b32",
    target: "shaved-snow",
    cta: "Order one",
  },
  {
    id: "asian-ice",
    eyebrow: "Build your own",
    title: "Six toppings, your call",
    body: "Pick all six yourself. Red bean, mochi, lychee, mango, boba, corn.",
    image: "/menu/asian-ice.png",
    fit: "contain",
    tint: "#5fb6dd",
    target: "asian-ice",
    cta: "Start building",
  },
];

export function PromoStrip({ onSelect }: { onSelect: (target: string) => void }) {
  return (
    <section aria-label="Featured" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
      <ul className="grid gap-5 md:grid-cols-3">
        {PROMOS.map((promo) => (
          <li key={promo.id}>
            <button
              type="button"
              onClick={() => onSelect(promo.target)}
              className="group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border p-6 pr-28 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_10px_28px_rgba(26,21,18,0.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-7 sm:pr-32"
              style={{
                background: `radial-gradient(120% 120% at 100% 100%, ${promo.tint}3d, ${promo.tint}14 55%, var(--card))`,
              }}
            >
              <span className="font-mono text-[10px] tracking-[0.2em] text-brand-ink uppercase">
                {promo.eyebrow}
              </span>
              <span className="mt-2 font-display text-[26px] leading-[1.1] font-semibold text-balance">
                {promo.title}
              </span>
              <span className="mt-2.5 max-w-[26ch] text-[14px] leading-relaxed text-muted-foreground">
                {promo.body}
              </span>
              <span className="mt-5 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] uppercase">
                {promo.cta}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </span>

              <Image
                src={promo.image}
                alt=""
                width={220}
                height={220}
                className={
                  promo.fit === "cover"
                    ? "pointer-events-none absolute -right-6 -bottom-6 size-36 rounded-full object-cover sm:size-40"
                    : "pointer-events-none absolute right-2 bottom-2 size-28 object-contain sm:size-32"
                }
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

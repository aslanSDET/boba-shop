import { Star } from "lucide-react";
import { TESTIMONIALS } from "@/config/shop";

export function Testimonials() {
  return (
    <section
      aria-labelledby="testimonials-heading"
      className="border-t border-border bg-card"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <p className="text-center font-mono text-[11px] tracking-[0.2em] text-brand-ink uppercase">
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
                {t.name} · {t.city}
              </cite>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

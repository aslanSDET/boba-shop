import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The penguin climbs out of the "o" in Snowdaes.
 *
 * The "o" is a real Fraunces glyph rather than a drawn ring — a CSS circle
 * cannot match a serif's modulated stroke, and a wrong "o" is more obvious than
 * no trick at all. The mark is sized in `em` so the whole lockup scales with
 * whatever font-size the heading is given.
 */
export function Wordmark({
  className,
  markClassName,
  sizes = "128px",
  priority = false,
  loading = "lazy",
}: {
  className?: string;
  markClassName?: string;
  /**
   * The mark is sized in `em`, so its rendered width follows the heading it
   * sits in: ~125px in the hero, ~21px in the footer. Without this the
   * optimizer serves 640px to both, which is 232x the pixels the footer needs.
   */
  sizes?: string;
  /** Only the hero copy is above the fold; preloading the footer one is waste. */
  priority?: boolean;
  /**
   * `eager` without `priority`: loads normally, but emits no preload link.
   *
   * The footer copy needs this. It is a ~21px mark positioned absolutely out of
   * a text glyph, and Chrome does not fire lazy loading for it even when it is
   * demonstrably in the viewport — verified on a clean load, scrolled to the
   * footer, still unloaded after 4s. Forcing eager loads it instantly, so the
   * srcset is fine; the intersection just never triggers. At the 24px candidate
   * this costs about a kilobyte.
   */
  loading?: "lazy" | "eager";
}) {
  return (
    <span className={cn("font-display font-semibold tracking-tight", className)}>
      <span className="sr-only">Snowdaes</span>
      <span aria-hidden className="inline-flex items-baseline leading-[0.9]">
        Sn
        <span className="relative inline-block">
          o
          <Image
            src="/brand/snowdaes-mark.png"
            alt=""
            width={240}
            height={240}
            sizes={sizes}
            priority={priority}
            loading={priority ? undefined : loading}
            className={cn(
              // max-w-none: preflight caps images at 100% of the "o", which is far too small
              "pointer-events-none absolute left-1/2 h-auto w-[0.65em] max-w-none -translate-x-1/2",
              markClassName,
            )}
            style={{ bottom: "0.1em" }}
          />
        </span>
        wdaes
      </span>
    </span>
  );
}

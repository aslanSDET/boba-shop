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
}: {
  className?: string;
  markClassName?: string;
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
            priority
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

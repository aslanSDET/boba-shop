import { getImageProps } from "next/image";

/**
 * A decorative hero product shot that only exists on wide viewports.
 *
 * The hero art is `lg:` and up only, and it is above the fold, which puts two
 * requirements in tension:
 *
 *   - On desktop these are the LCP element, so they must not be lazy. Next dev
 *     warns about exactly this ("detected as the Largest Contentful Paint").
 *   - On a phone they never render, and phones are the primary traffic. A plain
 *     `priority` or `loading="eager"` would download all four anyway, because a
 *     `display: none` image is still fetched when it isn't lazy.
 *
 * `loading="lazy"` currently resolves that by accident — a hidden image has no
 * layout box, so it never intersects and never loads — but it also means the
 * desktop LCP waits on the intersection observer.
 *
 * `<picture>` with a media-conditioned `<source>` settles it properly: the
 * browser picks a candidate *before* fetching, so below `lg` nothing but the
 * inline transparent pixel is ever requested, and at `lg` and up the real image
 * loads eagerly. See next/image `getImageProps` — the documented escape hatch
 * for art direction.
 */

/** 1x1 transparent GIF. A data URI, so the mobile fallback costs no request. */
const BLANK =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Matches the `lg:` breakpoint the hero art is gated on. */
const DESKTOP = "(min-width: 1024px)";

export function HeroArt({
  src,
  width,
  height,
  sizes,
  className,
}: {
  src: string;
  width: number;
  height: number;
  /** Rendered size hint, same meaning as next/image `sizes`. */
  sizes: string;
  className?: string;
}) {
  const {
    props: { srcSet, sizes: resolvedSizes },
  } = getImageProps({ src, alt: "", width, height, sizes });

  return (
    <picture>
      {/* `sizes` has to travel with `srcSet`: the candidates carry `w`
          descriptors, and without it the browser resolves no candidate at all
          and leaves `currentSrc` empty. */}
      <source media={DESKTOP} srcSet={srcSet} sizes={resolvedSizes} />
      <img
        src={BLANK}
        alt=""
        aria-hidden
        loading="eager"
        decoding="async"
        width={width}
        height={height}
        className={className}
      />
    </picture>
  );
}

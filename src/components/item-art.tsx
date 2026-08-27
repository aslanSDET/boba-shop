"use client";

import { useId } from "react";
import { itemArtFor } from "@/config/item-art";
import type { ProductType } from "@/types/boba";
import { cn } from "@/lib/utils";

const INK = "#1a1512";
/** Empty cup above the fill line, on a light ground. */
const HEADSPACE = "#f1ebe3";

const TALL_CUP = "M9 25 H55 L48.6 80.4 Q48.2 84 44.6 84 H19.4 Q15.8 84 15.4 80.4 Z";
const SHORT_CUP = "M12 46 H52 L46.6 80.4 Q46.2 84 42.8 84 H21.2 Q17.8 84 17.4 80.4 Z";
const SLEEVE = "M19 48 H45 L38.5 79 Q36.5 82 32 82 Q27.5 82 25.5 79 Z";

const PEARLS: Array<[number, number, number]> = [
  [22, 78, 3.1],
  [29, 79.5, 3.3],
  [36.5, 78.5, 3.1],
  [43, 79, 2.9],
  [25.5, 72.5, 3],
  [33, 73.5, 3.2],
  [40, 72.5, 2.9],
];

/** Scattered toppings on a snow or ice mound. */
const FLECKS: Array<[number, number, number]> = [
  [24, 30, 2.1],
  [33, 24, 2.4],
  [41, 31, 2.1],
  [28, 38, 1.9],
  [38, 39, 2.2],
  [32, 33, 2],
  [45, 38, 1.8],
  [20, 39, 1.8],
];

interface ItemArtProps {
  itemId: string;
  productType: ProductType;
  className?: string;
}

export function ItemArt({ itemId, productType, className }: ItemArtProps) {
  const art = itemArtFor(itemId, productType);
  const uid = useId().replace(/:/g, "");
  const grad = `f-${uid}`;
  const clip = `c-${uid}`;

  const mounded = productType === "SHAVED_SNOW" || productType === "SHAVED_ICE";
  const puff = productType === "EGG_PUFF";
  const cupPath = mounded ? SHORT_CUP : TALL_CUP;

  return (
    <svg viewBox="0 0 64 88" role="presentation" className={cn("h-full w-full", className)}>
      <defs>
        {/* userSpaceOnUse so the mound and the cup share one continuous ramp */}
        <linearGradient id={grad} gradientUnits="userSpaceOnUse" x1="0" y1="18" x2="0" y2="84">
          <stop offset="0%" stopColor={art.fill[0]} />
          <stop offset="100%" stopColor={art.fill[1]} />
        </linearGradient>
        <clipPath id={clip}>
          <path d={cupPath} />
        </clipPath>
      </defs>

      {puff ? (
        <>
          {/* The bubble sheet: a 4x3 grid whose union gives the waffle silhouette */}
          <g transform="rotate(-6 32 36)">
            <g fill={`url(#${grad})`}>
              {[17, 27, 37, 47].map((cx) =>
                [26, 36, 46].map((cy) => (
                  <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="6.4" />
                )),
              )}
            </g>
            <g fill="none" stroke={INK} strokeOpacity="0.18" strokeWidth="0.9">
              {[17, 27, 37, 47].map((cx) =>
                [26, 36, 46].map((cy) => (
                  <circle key={`o-${cx}-${cy}`} cx={cx} cy={cy} r="6.4" />
                )),
              )}
            </g>
          </g>
          <path d={SLEEVE} fill="#fdfbf7" stroke={INK} strokeOpacity="0.28" strokeWidth="1.5" />
        </>
      ) : (
        <>
          {/* Straw for drinks */}
          {!mounded && (
            <rect
              x="40"
              y="1"
              width="4.6"
              height="26"
              rx="2.3"
              fill="#e0654f"
              transform="rotate(13 42.75 14)"
            />
          )}

          {/* Snow or shaved-ice mound sits above the rim */}
          {mounded && (
            <g fill={`url(#${grad})`}>
              <circle cx="23" cy="38" r="11" />
              <circle cx="32" cy="30" r="13" />
              <circle cx="41" cy="38" r="11" />
              <rect x="12" y="38" width="40" height="10" />
            </g>
          )}

          <g clipPath={`url(#${clip})`}>
            <rect x="0" y="0" width="64" height="88" fill={HEADSPACE} />
            <rect
              x="0"
              y={mounded ? 46 : 30}
              width="64"
              height="88"
              fill={`url(#${grad})`}
            />

            {art.cap && !mounded && <rect x="0" y="30" width="64" height="11" fill={art.cap} />}

            {art.streaks && (
              <g fill="none" stroke="#5e3210" strokeLinecap="round" opacity="0.72">
                <path d="M18.8 33 Q16.6 49 19.6 67" strokeWidth="2.6" />
                <path d="M45 35 Q47.4 51 43.8 69" strokeWidth="2.2" />
                <path d="M30.5 31 Q28.4 43 31.4 57" strokeWidth="1.8" />
              </g>
            )}

            {art.pearl &&
              PEARLS.map(([cx, cy, r], i) => (
                <circle key={i} cx={cx} cy={cy} r={r} fill={art.pearl} />
              ))}
          </g>

          {/* Condensed-milk cap drizzled over a mound */}
          {mounded && art.cap && (
            <path
              d="M19 33 Q26 27 32 31 Q39 26 45 33"
              fill="none"
              stroke={art.cap}
              strokeWidth="3.4"
              strokeLinecap="round"
            />
          )}

          {mounded &&
            art.flecks &&
            FLECKS.map(([cx, cy, r], i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill={art.flecks![i % art.flecks!.length]}
              />
            ))}

          {mounded && (
            <path
              d="M12 47 Q12 33.5 21 29.5 Q25 18 32 18 Q39 18 43 29.5 Q52 33.5 52 47"
              fill="none"
              stroke={INK}
              strokeOpacity="0.26"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          )}

          {!mounded && (
            <rect x="6.5" y="17" width="51" height="9" rx="3" fill="#ffffff" stroke={INK} strokeOpacity="0.22" strokeWidth="1.1" />
          )}

          <path d={cupPath} fill="none" stroke={INK} strokeOpacity="0.28" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

"use client";

import Image from "next/image";
import { ItemArt } from "@/components/item-art";
import { itemArtFor } from "@/config/item-art";
import type { MenuItem } from "@/types/boba";
import { cn } from "@/lib/utils";

/**
 * A photograph when the shop has one, the drawn stand-in when it doesn't.
 * Both sit on the same tinted tile so a mixed list still reads as one set.
 */
export function ItemVisual({
  item,
  className,
  px = 128,
}: {
  item: MenuItem;
  /** Sizing lives in classes so the tile can be responsive. */
  className?: string;
  /** Intrinsic pixel hint for next/image; not the rendered size. */
  px?: number;
}) {
  const tint = itemArtFor(item.id, item.productType).tint;

  return (
    <span
      className={cn("relative grid shrink-0 place-items-center overflow-hidden", className)}
      style={{
        background: `radial-gradient(100% 100% at 50% 15%, ${tint}4d, ${tint}24 55%, ${tint}12)`,
      }}
    >
      {item.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt=""
          width={px}
          height={px}
          sizes="128px"
          className={cn(
            "size-full",
            item.imageFit === "cover" ? "object-cover" : "object-contain p-1",
          )}
        />
      ) : (
        <ItemArt
          itemId={item.id}
          productType={item.productType}
          className="h-[82%] w-auto"
        />
      )}
    </span>
  );
}

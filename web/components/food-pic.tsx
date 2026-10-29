import type { CSSProperties } from "react";
import Image from "next/image";
import type { Category } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FoodSymbol } from "@/components/food-symbols";

/**
 * Picture frame with the bite mark (CSS mask); round for the recent chips. Without a photo
 * it shows the symbol of the food's category, the one of "other" without a category.
 */
export function FoodPic({
  size = 44,
  round = false,
  src,
  category = null,
}: {
  size?: number;
  round?: boolean;
  /** URL of the product photo. */
  src?: string | null;
  category?: Category | null;
}) {
  return (
    <span
      className={cn("biss-pic", round && "biss-pic-round")}
      style={{ "--s": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {src ? <Image src={src} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" /> : <FoodSymbol category={category} />}
    </span>
  );
}

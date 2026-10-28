import type { CSSProperties } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/* Placeholder from the prototype (ART.plate) for foods without a product photo. */
const PLATE = (
  <svg viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="18" fill="#F2F2EE" stroke="#BDBDB4" strokeWidth="1.2" />
    <circle cx="24" cy="24" r="11" fill="none" stroke="#D8D8D0" />
  </svg>
);

/** Picture frame with the bite mark (CSS mask); round for the recent chips. */
export function FoodPic({
  size = 44,
  round = false,
  src,
}: {
  size?: number;
  round?: boolean;
  /** URL of the product photo; without it the plate shows. */
  src?: string | null;
}) {
  return (
    <span
      className={cn("biss-pic", round && "biss-pic-round")}
      style={{ "--s": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {src ? <Image src={src} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" /> : PLATE}
    </span>
  );
}

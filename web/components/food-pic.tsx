import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/* Placeholder from the prototype (ART.plate) until product photos arrive with E2. */
const PLATE = (
  <svg viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="18" fill="#F2F2EE" stroke="#BDBDB4" strokeWidth="1.2" />
    <circle cx="24" cy="24" r="11" fill="none" stroke="#D8D8D0" />
  </svg>
);

/** Picture frame with the bite mark (CSS mask); round for the recent chips. */
export function FoodPic({ size = 44, round = false }: { size?: number; round?: boolean }) {
  return (
    <span
      className={cn("biss-pic", round && "biss-pic-round")}
      style={{ "--s": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {PLATE}
    </span>
  );
}

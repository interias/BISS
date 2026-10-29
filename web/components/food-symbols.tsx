import type { ReactNode } from "react";
import type { Category } from "@/lib/api";

/*
 * Symbols of the food categories for foods without a photo, drawn for BISS: one line style
 * on a 24 grid, stroke in currentColor (the muted ink), so they follow light and dark.
 */
const PATHS: Record<Category, ReactNode> = {
  // A loaf with three cuts.
  bread: (
    <>
      <path d="M4 15.5c0-4.5 3.6-7.5 8-7.5s8 3 8 7.5V18H4z" />
      <path d="M9 10.5l-1.5 3M13 10l-1.5 3.5M17 11l-1.5 3" />
    </>
  ),
  // An ear of grain.
  grains: (
    <>
      <path d="M12 21V6" />
      <path d="M12 9c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 9c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z" />
      <path d="M12 14c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 14c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4z" />
    </>
  ),
  // An apple with a leaf.
  fruit: (
    <>
      <path d="M12 8c-1.5-1-5-1.2-6.5 1.5S5 17 8 19.5c1.4 1.1 2.6.6 4 .1 1.4.5 2.6 1 4-.1 3-2.5 4-7.3 2.5-10S13.5 7 12 8z" />
      <path d="M12 8c0-2 .8-3.5 2.5-4.5M12.5 6c1.5-1.5 3.5-1.5 4.5-.5-1 1.2-3 1.4-4.5.5" />
    </>
  ),
  // A carrot with greens.
  vegetables: (
    <>
      <path d="M15.5 8.5L5 19c-.6.6.1 1.4.8.9L16.5 11.5c1.2-1.2 1-2.8-.1-3.4-.4-.2-.6-.2-.9.4z" />
      <path d="M16 8l1.5-4M16.5 8.5L20 7M16.5 8.5l3 1.5" />
      <path d="M10 14l1.5 1.5M8 16l1.2 1.2" />
    </>
  ),
  // A pea pod, open.
  legumes: (
    <>
      <path d="M4 16c4 3 11 2.5 16-8-5 1-9 2-12 4.5C6.5 13.7 5 15 4 16z" />
      <circle cx="9" cy="14.2" r="1.4" />
      <circle cx="12.5" cy="12.4" r="1.4" />
      <circle cx="16" cy="10.4" r="1.4" />
    </>
  ),
  // A potato with eyes.
  potatoes: (
    <>
      <path d="M6 9.5C8 5.5 15 4.5 18 8s1.5 9-3 10.5S4.5 18 4.5 14c0-1.8.7-3.3 1.5-4.5z" />
      <path d="M9.5 10.5h.01M14 9h.01M15 14h.01M10.5 15h.01" strokeWidth="2.2" />
    </>
  ),
  // A milk carton.
  dairy: (
    <>
      <path d="M8 8l2-4h4l2 4v12H8z" />
      <path d="M8 8h8M10 4l2 4" />
      <path d="M8 13h8" />
    </>
  ),
  // An egg.
  eggs: <path d="M12 3.5c3.5 0 6.5 5.5 6.5 10a6.5 6.5 0 0 1-13 0c0-4.5 3-10 6.5-10z" />,
  // A drumstick.
  meat: (
    <>
      <path d="M14.5 4.5c3 0 5.5 2.4 5 5.5-.4 2.8-3.2 4.7-6 4.5l-3 3" />
      <path d="M14.5 4.5c-3 0-5 2.3-5 5 0 1 .3 2 .8 2.8l-2.8 2.8" />
      <path d="M7.5 15a2 2 0 1 0-2 2.5 2 2 0 1 0 2.5-2" />
    </>
  ),
  // A sausage, tied at both ends.
  sausage: (
    <>
      <path d="M6 15.5C8 18.5 14 19.5 18 15.5s3-9 0-10.5c-1.8-.9-3 .2-3.5 1.8-.9 3-3 5.5-6 6.3-1.8.5-3.4.9-2.5 2.4z" />
      <path d="M19.5 4.5l1-1.5M4.8 16.5l-1.5.8" />
    </>
  ),
  // A fish.
  fish: (
    <>
      <path d="M3.5 12c2.5-4 6-5.5 9.5-5.5 3.5 0 6 2.5 7.5 5.5-1.5 3-4 5.5-7.5 5.5-3.5 0-7-1.5-9.5-5.5z" />
      <path d="M3.5 12L2 9M3.5 12L2 15" />
      <path d="M16.5 10.5h.01" strokeWidth="2.2" />
    </>
  ),
  // An oil drop.
  fats: (
    <>
      <path d="M12 3.5c3 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.5 6-10.5z" />
      <path d="M9.5 14.5a2.5 2.5 0 0 0 2 2.3" />
    </>
  ),
  // A wrapped sweet.
  sweets: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M8.5 9.2L4 7v6zM15.5 14.8L20 17v-6z" />
    </>
  ),
  // A glass with a straw.
  drinks: (
    <>
      <path d="M6.5 8h11l-1.5 12h-8z" />
      <path d="M13 8l2-5h2.5M7 12h10" />
    </>
  ),
  // A bowl with steam.
  dishes: (
    <>
      <path d="M3.5 12h17a8.5 7 0 0 1-17 0z" />
      <path d="M9 19.5h6M9.5 8.5c-1-1 1-2 0-3.5M14.5 8.5c-1-1 1-2 0-3.5" />
    </>
  ),
  // A plate with a fork, the prototype's placeholder as a line.
  other: (
    <>
      <circle cx="13" cy="12" r="7" />
      <circle cx="13" cy="12" r="4" />
      <path d="M3.5 4v5.5M2.5 4v3M4.5 4v3M3.5 9.5V20" />
    </>
  ),
};

/** The symbol of a category; without one (null) the symbol of "other". */
export function FoodSymbol({ category }: { category: Category | null }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-category={category ?? "other"}
      className="text-muted-foreground"
    >
      {PATHS[category ?? "other"]}
    </svg>
  );
}

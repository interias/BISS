import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import type { Category } from "@/lib/api";
import { CATEGORY_LABELS } from "@/lib/format";
import { FoodSymbol } from "./food-symbols";

// Vitest runs from web/.
const css = readFileSync("app/globals.css", "utf8");
const [light, dark] = css.split("@media (prefers-color-scheme: dark) {");
const categories = Object.keys(CATEGORY_LABELS) as Category[];

test("every category has its own colour in light and dark", () => {
  for (const key of categories) {
    expect(light).toContain(`--biss-cat-${key}:`);
    // "other" stays the muted ink, which switches with the theme by itself.
    if (key !== "other") expect(dark).toContain(`--biss-cat-${key}:`);
  }
});

test("the symbol is drawn in its category's colour, without a category in the one of other", () => {
  const { container, rerender } = render(<FoodSymbol category="fruit" />);
  expect(container.querySelector("svg")!.style.color).toBe("var(--biss-cat-fruit)");
  rerender(<FoodSymbol category={null} />);
  expect(container.querySelector("svg")!.style.color).toBe("var(--biss-cat-other)");
});

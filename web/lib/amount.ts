import type { Basis, Macros } from "@/lib/api";

/** The smallest amount anywhere; the backend only rejects 0 g and less. */
export const MIN_GRAMS = 1;

/**
 * The − and + buttons walk one grid: 1 g steps below 20 g, 5 g steps up to 100 g, 10 g
 * steps above. + goes to the next grid value, − to the previous one, so both are inverse on
 * the grid and a typed value off the grid (58 g) snaps to its neighbours (55 g, 60 g).
 */
export const stepUp = (grams: number, max = Infinity) => {
  const step = grams < 20 ? 1 : grams < 100 ? 5 : 10;
  return Math.min(max, Math.floor(grams / step) * step + step);
};

export const stepDown = (grams: number) => {
  const step = grams <= 20 ? 1 : grams <= 100 ? 5 : 10;
  return Math.max(MIN_GRAMS, Math.ceil(grams / step) * step - step);
};

/**
 * How many servings the grams are: 2 for 110 g of "1 Ei (M)" (55 g), 0 when they are no
 * whole number of them. A tap on the chip of a serving adds one more.
 */
export const servingCount = (grams: number, servingGrams: number) => {
  const count = Math.round(grams / servingGrams);
  return count >= 1 && Math.abs(count * servingGrams - grams) < 0.05 ? count : 0;
};

/** The grams of `count` servings, without the noise of floats (3 × 1.2 g). */
export const servingsGrams = (count: number, servingGrams: number) =>
  Math.round(count * servingGrams * 10) / 10;

/**
 * Local preview in the amount sheet: value per 100 × amount / 100 (ADR-0003). For
 * basis ml the values are per 100 ml, so the grams go through the density first.
 * Rounded to 0.1 like the backend snapshot, so the preview shows what the diary will
 * show. Display only; the backend computes the stored snapshot.
 */
export function previewMacros(per100: Macros, grams: number, basis: Basis, density = 1): Macros {
  const factor = (basis === "ml" ? grams / density : grams) / 100;
  const scale = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    kcal: scale(per100.kcal),
    protein: scale(per100.protein),
    carbs: scale(per100.carbs),
    fat: scale(per100.fat),
  };
}

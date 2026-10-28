import type { Basis, Macros } from "@/lib/api";

/** The − button: 10 g above 100 g, else 5 g, never below 5 g (prototype). */
export const stepDown = (grams: number) => Math.max(5, grams - (grams > 100 ? 10 : 5));

/** The + button: 10 g from 100 g upwards, else 5 g (prototype). */
export const stepUp = (grams: number) => grams + (grams >= 100 ? 10 : 5);

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

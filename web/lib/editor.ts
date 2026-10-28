import type { Per100, Serving } from "@/lib/api";

/** Number fields of the editor, in the order of the nutrition table. */
export const NUTRIENTS = [
  { key: "kcal", label: "Energie (kcal)", required: true },
  { key: "protein", label: "Eiweiß (g)", required: true },
  { key: "carbs", label: "Kohlenhydrate (g)", required: true },
  { key: "fat", label: "Fett (g)", required: true },
  { key: "fiber", label: "Ballaststoffe (g)", required: false },
  { key: "sugar", label: "Zucker (g)", required: false },
  { key: "sat_fat", label: "Gesättigte Fettsäuren (g)", required: false },
  { key: "salt", label: "Salz (g)", required: false },
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number]["key"];

/** A number as shown in an input: decimal comma, no trailing zeros. */
export const toInput = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));

/** Input text → number; blank is `null`, text that is no number is `NaN`. */
export function parseInput(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : Number(trimmed.replace(",", "."));
}

const valid = (value: number | null) => value === null || (Number.isFinite(value) && value >= 0);

/**
 * The values of the table as the API takes them, or `null` while one is no number or
 * negative. A blank required value counts as 0 (prototype), a blank optional one as unset.
 */
export function readNutrients(texts: Record<NutrientKey, string>): Per100 | null {
  const out: Record<string, number | null> = {};
  for (const { key, required } of NUTRIENTS) {
    const value = parseInput(texts[key]);
    if (!valid(value)) return null;
    out[key] = value ?? (required ? 0 : null);
  }
  return out as Per100;
}

type ServingBase = Pick<Serving, "label" | "grams" | "origin">;

/**
 * Origin tag while editing: a package or estimated serving whose label or grams changed
 * shows `own` at once. Display only; the backend sets the origin when it saves (ADR-0003),
 * and a change of the star alone does not touch it.
 */
export function shownOrigin(original: ServingBase | undefined, label: string, grams: number | null) {
  if (!original) return "own";
  const edited = label !== original.label || grams !== original.grams;
  return original.origin !== "own" && edited ? "own" : original.origin;
}

/** True for text that is no number or negative; blank is fine (see `readNutrients`). */
export const isInvalid = (text: string) => !valid(parseInput(text));

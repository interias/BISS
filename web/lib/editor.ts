import type { LabelDraft, Per100, Serving } from "@/lib/api";

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

/** The values of a label draft under the food's names (SPEC 7 `energy_kcal` → `kcal` …). */
export const per100OfLabel = (v: LabelDraft["per_100"]): Per100 => ({
  kcal: v.energy_kcal,
  protein: v.protein,
  carbs: v.carbs,
  fat: v.fat,
  fiber: v.fiber,
  sugar: v.sugar,
  sat_fat: v.saturated_fat,
  salt: v.salt,
});

/**
 * The servings of a label draft the editor takes over, with their origin (SPEC 7 `source`),
 * and why the others stay out. A serving is stored in grams, so only an amount in the unit
 * of the basis is one: ml at a food per 100 ml counts as grams with the density 1.0 a new
 * food gets (SPEC 4), ml at a food per 100 g is no amount in grams.
 */
export function servingsOfLabel(draft: LabelDraft) {
  const basis = draft.per_100.basis;
  const servings: ServingBase[] = [];
  const skipped: string[] = [];
  for (const s of draft.servings) {
    if (s.unit !== basis) skipped.push(`${s.unit} bei Basis ${basis}`);
    else if (!(s.amount > 0)) skipped.push("ohne Menge");
    else servings.push({ label: s.label.trim(), grams: s.amount, origin: s.source });
  }
  return { servings, skipped };
}

/** The editor's note on label servings left out, `null` when none is. */
export function skippedNote(skipped: string[]) {
  if (skipped.length === 0) return null;
  const count = skipped.length === 1 ? "1 Portion" : `${skipped.length} Portionen`;
  return `${count} aus dem Etikett nicht übernommen (${[...new Set(skipped)].join(", ")}).`;
}

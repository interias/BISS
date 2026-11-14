"use client";

import { useEffect, useState } from "react";
import { getFood, imageUrl, type Entry, type FoodDetail, type Serving } from "@/lib/api";
import { previewMacros, servingCount, servingsGrams } from "@/lib/amount";
import { brandLine, fmt, SOURCE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FoodPic } from "@/components/food-pic";
import { IngredientGrams } from "@/components/ingredient-grams";
import { SheetTitle } from "@/components/sheet";

type Actions = {
  busy?: boolean;
  onSubmit: (grams: number) => void;
  onRemove?: () => void;
  /**
   * Opens the editor; gets the current grams so the sheet can come back as it was, and the
   * recipe when the food is one (then the recipe is edited, not the food).
   */
  onEdit?: (grams: number, recipeId?: number) => void;
};

/** Grams to start with, e.g. when the sheet comes back from the editor. */
type Initial = { grams: number };

/** What the form shows: a stored food or a scanned draft, whose servings have no id yet. */
export type AmountFood = Pick<
  FoodDetail,
  | "name"
  | "brand"
  | "source"
  | "basis"
  | "density"
  | "image_path"
  | "category"
  | "per_100"
  | "standard_serving"
  | "last_grams"
  | "recipe_id"
> & { servings: Omit<Serving, "id">[] };

/** Amount sheet; loads the food for servings and density, then shows the form. */
export function AmountSheet({
  foodId,
  entry,
  initial,
  ...actions
}: Actions & { foodId: number; entry?: Entry; initial?: Initial }) {
  const [food, setFood] = useState<FoodDetail | null>(null);
  useEffect(() => {
    let live = true;
    getFood(foodId).then((detail) => live && setFood(detail), console.error);
    return () => {
      live = false;
    };
  }, [foodId]);

  if (!food) return <SheetTitle className="sr-only">Menge wählen</SheetTitle>;
  return <AmountForm food={food} entry={entry} initial={initial} {...actions} />;
}

export const DOTS = [
  { key: "protein", label: "Eiweiß", color: "var(--biss-prot)" },
  { key: "carbs", label: "KH", color: "var(--biss-carb)" },
  { key: "fat", label: "Fett", color: "var(--biss-fat)" },
] as const;

const CHIP =
  "inline-flex flex-none items-center gap-1.5 rounded-full border bg-surface-2 px-3 py-[7px] text-[13px] font-semibold whitespace-nowrap";

/**
 * Picture, source, name, brand, grams with ± or typed, serving chips and the local preview
 * of kcal/E/K/F (ADR-0003). With an entry it edits: "Speichern" and "Entfernen". There is no
 * meal: the backend suggests it by the time of day and the diary does not show it.
 *
 * A new entry starts with the amount last logged of the food, else with its standard
 * serving. A tap on the chip of a serving sets it, each further tap adds one more ("2 × 1 Ei");
 * from two servings on a − in front of the chip takes one away.
 * The amounts last logged that are no serving stand behind the servings as "zuletzt".
 */
export function AmountForm({
  food,
  entry,
  initial,
  busy,
  onSubmit,
  onRemove,
  onEdit,
}: Actions & { food: AmountFood; entry?: Entry; initial?: Initial }) {
  const [grams, setGrams] = useState(
    initial?.grams ?? entry?.grams ?? food.last_grams?.[0] ?? food.standard_serving.grams,
  );
  const last = (food.last_grams ?? []).filter(
    (amount) => !food.servings.some((serving) => servingCount(amount, serving.grams)),
  );
  const preview = previewMacros(food.per_100, grams, food.basis, food.density);

  return (
    <>
      <div className="mb-3.5 grid grid-cols-[auto_1fr_auto] items-center gap-3.5">
        <FoodPic size={64} src={food.image_path && imageUrl(food.image_path)} category={food.category} />
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-bold tracking-[.12em] text-muted-foreground uppercase">
            {SOURCE_LABELS[food.source]}
          </p>
          <SheetTitle className="font-heading text-[21px] leading-[1.15] font-bold text-balance">
            {food.name}
          </SheetTitle>
          <p className="mt-[3px] text-[13.5px] text-muted-foreground">
            {brandLine(food.brand, food.source)}
          </p>
        </div>
        <div className="grid justify-items-end gap-1.5">
          {onEdit && (
            <button
              type="button"
              onClick={() => (food.recipe_id ? onEdit(grams, food.recipe_id) : onEdit(grams))}
              className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
              </svg>
              Bearbeiten
            </button>
          )}
        </div>
      </div>

      {food.source === "off" && (
        // Attribution for data under ODbL (ADR-0002).
        <p className="-mt-1 mb-3 text-[12px] text-muted-foreground">Daten von Open Food Facts (ODbL)</p>
      )}

      <IngredientGrams large grams={grams} max={Infinity} onChange={setGrams} />

      {food.servings.length + last.length > 0 && (
        <div className="mb-[18px] flex flex-wrap justify-center gap-2">
          {food.servings.map((serving) => {
            const count = servingCount(grams, serving.grams);
            return (
              <span key={`${serving.label}-${serving.grams}`} className="inline-flex flex-none items-center gap-1">
                {count > 1 && (
                  <button
                    type="button"
                    aria-label={`${serving.label} abziehen`}
                    onClick={() => setGrams(servingsGrams(count - 1, serving.grams))}
                    className="size-[34px] rounded-full border border-primary bg-surface-2 text-[17px] leading-none font-bold"
                  >
                    −
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setGrams(servingsGrams(count + 1, serving.grams))}
                  aria-pressed={count > 0}
                  className={cn(CHIP, count > 0 && "border-primary bg-accent")}
                >
                  {count > 1 && `${count} × `}
                  {serving.label}
                  <small className="font-medium text-muted-foreground tabular-nums">
                    {fmt(servingsGrams(count || 1, serving.grams))} g
                  </small>
                </button>
              </span>
            );
          })}
          {last.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setGrams(amount)}
              aria-label={`zuletzt ${fmt(amount)} g`}
              aria-pressed={amount === grams}
              className={cn(CHIP, amount === grams && "border-primary bg-accent")}
            >
              <small className="font-medium text-muted-foreground">zuletzt</small>
              <span className="tabular-nums">{fmt(amount)} g</span>
            </button>
          ))}
        </div>
      )}

      <div data-testid="preview" className="mb-[18px] grid grid-cols-4 rounded-[14px] border tabular-nums">
        <div className="px-1.5 py-2.5 text-center">
          <b className="block text-[17px]">{fmt(preview.kcal)}</b>
          <span className="text-[11.5px] font-semibold text-muted-foreground">kcal</span>
        </div>
        {DOTS.map(({ key, label, color }) => (
          <div key={key} className="border-l px-1.5 py-2.5 text-center">
            <b className="block text-[17px]">{fmt(preview[key])}</b>
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              <i
                className="mr-1 inline-block size-[7px] rounded-full align-[1px]"
                style={{ background: color }}
              />
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-2.5">
        {entry && onRemove && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="h-[54px] rounded-2xl border px-[18px] font-semibold text-muted-foreground"
          >
            Entfernen
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onSubmit(grams)}
          className="h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground tabular-nums disabled:cursor-not-allowed disabled:opacity-45"
        >
          {entry ? "Speichern" : "Eintragen"} · {fmt(preview.kcal)} kcal
        </button>
      </div>
    </>
  );
}

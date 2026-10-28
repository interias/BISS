"use client";

import { useEffect, useState } from "react";
import { getFood, type Entry, type FoodDetail, type Meal } from "@/lib/api";
import { previewMacros, stepDown, stepUp } from "@/lib/amount";
import { brandLine, fmt, MEAL_LABELS, MEALS, SOURCE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FoodPic } from "@/components/food-pic";
import { SheetTitle } from "@/components/sheet";

type Actions = {
  busy?: boolean;
  onSubmit: (grams: number, meal: Meal) => void;
  onRemove?: () => void;
};

/** Amount sheet; loads the food for servings and density, then shows the form. */
export function AmountSheet({
  foodId,
  entry,
  suggestedMeal,
  ...actions
}: Actions & { foodId: number; entry?: Entry; suggestedMeal: Meal }) {
  const [food, setFood] = useState<FoodDetail | null>(null);
  useEffect(() => {
    let live = true;
    getFood(foodId).then((detail) => live && setFood(detail), console.error);
    return () => {
      live = false;
    };
  }, [foodId]);

  if (!food) return <SheetTitle className="sr-only">Menge wählen</SheetTitle>;
  return <AmountForm food={food} entry={entry} initialMeal={suggestedMeal} {...actions} />;
}

const DOTS = [
  { key: "protein", label: "Eiweiß", color: "var(--biss-prot)" },
  { key: "carbs", label: "KH", color: "var(--biss-carb)" },
  { key: "fat", label: "Fett", color: "var(--biss-fat)" },
] as const;

/**
 * Picture, source, name, brand, meal chip, grams with ±, serving chips and the local
 * preview of kcal/E/K/F (ADR-0003). With an entry it edits: "Speichern" and "Entfernen".
 */
export function AmountForm({
  food,
  entry,
  initialMeal,
  busy,
  onSubmit,
  onRemove,
}: Actions & { food: FoodDetail; entry?: Entry; initialMeal: Meal }) {
  const [grams, setGrams] = useState(entry?.grams ?? food.standard_serving.grams);
  const [meal, setMeal] = useState<Meal>(entry?.meal ?? initialMeal);
  const preview = previewMacros(food.per_100, grams, food.basis, food.density);
  const nextMeal = () => setMeal(MEALS[(MEALS.indexOf(meal) + 1) % MEALS.length]);

  return (
    <>
      <div className="mb-3.5 grid grid-cols-[auto_1fr_auto] items-center gap-3.5">
        <FoodPic size={64} />
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
        <button
          type="button"
          title="Mahlzeit wechseln"
          aria-label={`Mahlzeit: ${MEAL_LABELS[meal]}`}
          onClick={nextMeal}
          className="rounded-[10px] border bg-surface-2 px-[11px] py-[7px] text-[12.5px] font-bold"
        >
          {MEAL_LABELS[meal]}
        </button>
      </div>

      <div className="mt-1 mb-3.5 flex items-center justify-center gap-[18px]">
        <button
          type="button"
          aria-label="weniger"
          onClick={() => setGrams(stepDown(grams))}
          className="size-12 rounded-[14px] border bg-surface-2 text-[22px] font-semibold"
        >
          −
        </button>
        <output
          aria-label="Menge"
          className="min-w-[150px] text-center font-heading text-[44px] font-extrabold tabular-nums"
        >
          {fmt(grams)}
          <small className="ml-0.5 text-xl font-bold text-muted-foreground">g</small>
        </output>
        <button
          type="button"
          aria-label="mehr"
          onClick={() => setGrams(stepUp(grams))}
          className="size-12 rounded-[14px] border bg-surface-2 text-[22px] font-semibold"
        >
          +
        </button>
      </div>

      {food.servings.length > 0 && (
        <div className="mb-[18px] flex flex-wrap justify-center gap-2">
          {food.servings.map((serving) => (
            <button
              key={serving.id}
              type="button"
              onClick={() => setGrams(serving.grams)}
              aria-pressed={serving.grams === grams}
              className={cn(
                "inline-flex flex-none items-center gap-1.5 rounded-full border bg-surface-2 px-3 py-[7px] text-[13px] font-semibold whitespace-nowrap",
                serving.grams === grams && "border-primary bg-accent",
              )}
            >
              {serving.label}
              <small className="font-medium text-muted-foreground tabular-nums">
                {fmt(serving.grams)} g
              </small>
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
          onClick={() => onSubmit(grams, meal)}
          className="h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground tabular-nums disabled:cursor-not-allowed disabled:opacity-45"
        >
          {entry ? "Speichern" : "Eintragen"} · {fmt(preview.kcal)} kcal
        </button>
      </div>
    </>
  );
}

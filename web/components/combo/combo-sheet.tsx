"use client";

import { useState } from "react";
import type { Basis, Combo, ComboItemWrite, FoodSummary, Macros, Meal, SearchHit, Source } from "@/lib/api";
import { previewMacros } from "@/lib/amount";
import { fmt, MEAL_LABELS, MEALS, shortName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DOTS } from "@/components/amount-sheet";
import { clampGrams, IngredientGrams } from "@/components/ingredient-grams";
import { SearchSheet } from "@/components/search-sheet";
import { SheetTitle } from "@/components/sheet";

/** An item of the sheet: the food with what the local preview needs. */
type Row = {
  key: number;
  food: { id: number; name: string; brand: string | null; source: Source; basis: Basis; per_100: Macros };
  density: number;
  grams: number;
};

/** Row keys stay unique across sheets, so a removed row never hands its key on. */
let rowKeys = 0;

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Local preview of the sum (ADR-0003); the backend computes the stored snapshots. */
function sum(rows: Row[]) {
  return rows.reduce((total, row) => {
    const m = previewMacros(row.food.per_100, row.grams, row.food.basis, row.density);
    return {
      kcal: total.kcal + m.kcal,
      protein: total.protein + m.protein,
      carbs: total.carbs + m.carbs,
      fat: total.fat + m.fat,
    };
  }, ZERO);
}

const foodOf = (food: FoodSummary | SearchHit): Row["food"] => ({
  id: food.id!,
  name: food.name,
  brand: food.brand,
  source: food.source,
  basis: food.basis,
  per_100: food.per_100,
});

// Recent foods and search hits carry no density; 1 is right for every food in g.
const rowOf = (food: FoodSummary | SearchHit, grams: number, density = 1): Row => ({
  key: rowKeys++,
  food: foodOf(food),
  density,
  grams,
});

const written = (rows: Row[]): ComboItemWrite[] =>
  rows.map((row) => ({ food_id: row.food.id, grams: clampGrams(row.grams) }));

/**
 * Schnellzugriff sheet (ADR-0010). With a combo it adjusts one entry: items with ± and typed
 * grams, tauschen, ✕, "+ Zutat suchen", meal chips and "Eintragen · X kcal"; the template only
 * changes with "Als Vorlage speichern". "Löschen" asks inline before it deletes. Without a combo
 * it creates one: name and items, "Speichern".
 */
export function ComboSheet({
  combo,
  suggestedMeal,
  recent,
  busy,
  onLog,
  onSave,
  onDelete,
  onCancel,
}: {
  combo?: Combo;
  suggestedMeal: Meal;
  recent: FoodSummary[];
  busy?: boolean;
  onLog?: (items: ComboItemWrite[], meal: Meal) => void;
  onSave: (name: string, items: ComboItemWrite[]) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(combo?.name ?? "");
  const [rows, setRows] = useState<Row[]>(
    () => combo?.items.map((item) => rowOf(item.food, item.grams, item.density)) ?? [],
  );
  const [meal, setMeal] = useState<Meal>(suggestedMeal);
  // The row whose food is being swapped, or "new" for an item to add.
  const [searching, setSearching] = useState<number | "new" | null>(null);
  const [confirming, setConfirming] = useState(false);

  const change = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: number) => setRows((current) => current.filter((row) => row.key !== key));
  const add = (food: FoodSummary | SearchHit) =>
    setRows((current) => [...current, rowOf(food, food.standard_serving.grams)]);

  const total = sum(rows);
  const ready = name.trim() !== "" && rows.length > 0;
  const suggestions = recent.filter((food) => !rows.some((row) => row.food.id === food.id));

  const pick = (hit: SearchHit) => {
    if (hit.id === null || searching === null) return;
    if (searching === "new") add(hit);
    else change(searching, { food: foodOf(hit), density: 1 });
    setSearching(null);
  };

  if (searching !== null) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSearching(null)}
          className="mb-2 h-9 text-sm font-semibold text-muted-foreground"
        >
          ← Zurück zum Schnellzugriff
        </button>
        <SearchSheet foodsOnly onPick={pick} />
      </>
    );
  }

  return (
    <>
      <p className="mb-1 text-[11px] font-bold tracking-[.12em] text-muted-foreground uppercase">
        {combo ? "Schnellzugriff · anpassen" : "Neuer Schnellzugriff"}
      </p>
      <SheetTitle className="sr-only">{combo ? "Schnellzugriff anpassen" : "Schnellzugriff anlegen"}</SheetTitle>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Name"
        placeholder="Name, z. B. Kaffee"
        className="mb-1 w-full min-w-0 border-0 border-b bg-transparent pb-1.5 font-heading text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      <p className="mb-2.5 text-[12.5px] text-muted-foreground">
        {combo
          ? "Gilt nur für diesen Eintrag. Die Vorlage bleibt, außer du speicherst sie."
          : "Name und Zutaten mit Menge. Ein Tap trägt später alles ein."}
      </p>

      {combo && (
        <div role="group" aria-label="Mahlzeit" className="mb-2 flex flex-wrap gap-1.5">
          {MEALS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === meal}
              onClick={() => setMeal(option)}
              className={cn(
                "rounded-full border bg-surface-2 px-3 py-[5px] text-[12.5px] font-semibold",
                option === meal && "border-primary bg-accent",
              )}
            >
              {MEAL_LABELS[option]}
            </button>
          ))}
        </div>
      )}

      <ul aria-label="Zutaten">
        {rows.map((row) => {
          const kcal = previewMacros(row.food.per_100, row.grams, row.food.basis, row.density).kcal;
          return (
            <li
              key={row.key}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 border-b border-dashed py-2"
            >
              <span className="min-w-0 font-semibold">
                {row.food.name}
                <small className="block text-xs font-medium text-muted-foreground tabular-nums">
                  <span>{fmt(kcal)} kcal</span>
                  {" · "}
                  <button
                    type="button"
                    aria-label={`${row.food.name} tauschen`}
                    onClick={() => setSearching(row.key)}
                    className="font-bold text-primary"
                  >
                    tauschen
                  </button>
                </small>
              </span>
              <IngredientGrams
                name={row.food.name}
                grams={row.grams}
                onChange={(grams) => change(row.key, { grams })}
              />
              <button
                type="button"
                aria-label={`${row.food.name} entfernen`}
                onClick={() => remove(row.key)}
                className="size-[30px] text-muted-foreground"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="py-2 text-[13px] text-muted-foreground">Noch keine Zutat.</p>}

      <div role="group" aria-label="Vorschläge" className="mt-3 mb-[18px] flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSearching("new")}
          className="inline-flex flex-none items-center gap-1.5 rounded-full border border-primary px-3 py-[7px] text-[13px] font-semibold whitespace-nowrap text-primary"
        >
          + Zutat suchen
        </button>
        {suggestions.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => add(food)}
            className="inline-flex flex-none items-center gap-1.5 rounded-full border bg-surface-2 px-3 py-[7px] text-[13px] font-semibold whitespace-nowrap"
          >
            + {shortName(food.name)}
          </button>
        ))}
      </div>

      <div data-testid="preview" className="mb-[18px] grid grid-cols-4 rounded-[14px] border tabular-nums">
        <div className="px-1.5 py-2.5 text-center">
          <b className="block text-[17px]">{fmt(total.kcal)}</b>
          <span className="text-[11.5px] font-semibold text-muted-foreground">kcal</span>
        </div>
        {DOTS.map(({ key, label, color }) => (
          <div key={key} className="border-l px-1.5 py-2.5 text-center">
            <b className="block text-[17px]">{fmt(total[key])}</b>
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              <i className="mr-1 inline-block size-[7px] rounded-full align-[1px]" style={{ background: color }} />
              {label}
            </span>
          </div>
        ))}
      </div>

      {combo ? (
        <>
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={busy || !ready}
              onClick={() => onSave(name.trim(), written(rows))}
              className="h-[54px] rounded-2xl border px-[14px] text-[14px] font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-45"
            >
              Als Vorlage speichern
            </button>
            <button
              type="button"
              disabled={busy || rows.length === 0}
              onClick={() => onLog?.(written(rows), meal)}
              className="h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground tabular-nums disabled:cursor-not-allowed disabled:opacity-45"
            >
              Eintragen · {fmt(total.kcal)} kcal
            </button>
          </div>
          {onDelete && confirming && (
            <div role="group" aria-label="Löschen bestätigen" className="mt-3 flex items-center gap-2.5">
              <span className="flex-1 text-[13px] font-semibold">„{combo.name}“ löschen?</span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="h-9 rounded-xl border px-3 text-[13px] font-semibold text-muted-foreground"
              >
                Behalten
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onDelete}
                className="h-9 rounded-xl border border-destructive px-3 text-[13px] font-bold text-destructive"
              >
                Ja, löschen
              </button>
            </div>
          )}
          {onDelete && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 h-9 w-full text-[13px] font-semibold text-destructive"
            >
              Löschen
            </button>
          )}
        </>
      ) : (
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-[54px] rounded-2xl border px-[18px] font-semibold text-muted-foreground"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => onSave(name.trim(), written(rows))}
            className="h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
          >
            Speichern
          </button>
        </div>
      )}
    </>
  );
}

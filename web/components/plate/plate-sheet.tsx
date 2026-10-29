"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import type { Basis, FoodRef, FoodSummary, Macros, PlateExtraction, SearchHit } from "@/lib/api";
import { previewMacros } from "@/lib/amount";
import { fmt, shortName } from "@/lib/format";
import { DOTS } from "@/components/amount-sheet";
import { clampGrams, IngredientGrams } from "@/components/ingredient-grams";
import { SearchSheet } from "@/components/search-sheet";
import { SheetTitle } from "@/components/sheet";

/** "manual": added from the suggestions or matched by hand; the others come from the backend. */
type Tag = "recognized" | "guessed" | "manual";
const TAGS: Record<Tag, string> = { recognized: "erkannt", guessed: "vermutet", manual: "manuell" };

/** An ingredient of the sheet; without `food` it is not matched and is not logged. */
type Row = {
  key: number;
  name: string;
  grams: number;
  tag: Tag;
  food: FoodRef | null;
  per100: Macros | null;
  basis: Basis;
  density: number;
};

/** Row keys stay unique across sheets, so a removed row never hands its key on. */
let rowKeys = 0;

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Local preview of the sum (ADR-0003); an unmatched row has no values. */
function sum(rows: Row[]) {
  return rows.reduce((total, row) => {
    if (!row.per100) return total;
    const m = previewMacros(row.per100, row.grams, row.basis, row.density);
    return {
      kcal: total.kcal + m.kcal,
      protein: total.protein + m.protein,
      carbs: total.carbs + m.carbs,
      fat: total.fat + m.fat,
    };
  }, ZERO);
}

/**
 * Result sheet of the plate (prototype openPlate): photo, name, ingredients with "erkannt" or
 * "vermutet" (from the backend), grams by ± 10 g or typed, remove, a search that matches an
 * unmatched ingredient, swaps a wrong one or adds a new one, suggestions from the recent
 * foods and the local preview of the sum (ADR-0003). An unmatched ingredient has no food and
 * is not logged; "Eintragen" logs the matched ones.
 */
export function PlateSheet({
  plate,
  photo,
  recent,
  busy,
  onSubmit,
  onDiscard,
}: {
  plate: PlateExtraction;
  photo?: Blob;
  recent: FoodSummary[];
  busy?: boolean;
  onSubmit: (name: string, items: { food_id: number; grams: number }[]) => void;
  onDiscard: () => void;
}) {
  const [name, setName] = useState(plate.dish);
  const [rows, setRows] = useState<Row[]>(() =>
    plate.items.map((item) => ({
      key: rowKeys++,
      name: item.name,
      grams: item.grams,
      tag: item.certainty,
      food: item.food,
      per100: item.per_100,
      basis: item.basis ?? "g",
      density: item.density ?? 1,
    })),
  );
  // The row whose food is being searched for, or "new" for an ingredient to add.
  const [matching, setMatching] = useState<number | "new" | null>(null);
  // The photo is only shown here; the URL is released once the picture is loaded.
  const [photoUrl] = useState(() =>
    photo && typeof URL.createObjectURL === "function" ? URL.createObjectURL(photo) : null,
  );

  const change = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: number) => setRows((current) => current.filter((row) => row.key !== key));

  const total = sum(rows);
  const logged = rows.filter((row) => row.food);
  const unmatched = rows.length - logged.length;
  const suggestions = recent.filter((food) => !rows.some((row) => row.food?.id === food.id));
  const ready = name.trim() !== "" && logged.length > 0;

  const add = (food: FoodSummary | SearchHit, grams: number) =>
    setRows((current) => [
      ...current,
      {
        key: rowKeys++,
        name: food.name,
        grams,
        tag: "manual",
        food: { id: food.id!, name: food.name, brand: food.brand, source: food.source },
        per100: food.per_100,
        basis: food.basis,
        // Recent foods and search hits carry no density; 1 is right for every food in g.
        density: 1,
      },
    ]);
  const suggest = (food: FoodSummary) => add(food, food.standard_serving.grams);

  const match = (hit: SearchHit) => {
    if (hit.id === null || matching === null) return;
    if (matching === "new") {
      add(hit, hit.standard_serving.grams);
      setMatching(null);
      return;
    }
    change(matching, {
      tag: "manual",
      food: { id: hit.id, name: hit.name, brand: hit.brand, source: hit.source },
      per100: hit.per_100,
      basis: hit.basis,
      density: 1,
    });
    setMatching(null);
  };

  if (matching !== null) {
    return (
      <>
        <button
          type="button"
          onClick={() => setMatching(null)}
          className="mb-2 h-9 text-sm font-semibold text-muted-foreground"
        >
          ← Zurück zum Gericht
        </button>
        <SearchSheet foodsOnly onPick={match} />
      </>
    );
  }

  return (
    <>
      <div className="mb-3.5 flex items-center gap-3.5">
        <span className="biss-pic" style={{ "--s": "64px" } as CSSProperties} aria-hidden="true">
          {photoUrl && (
            <Image
              src={photoUrl}
              alt=""
              fill
              unoptimized
              sizes="64px"
              className="object-cover"
              onLoad={() => URL.revokeObjectURL(photoUrl)}
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-bold tracking-[.12em] text-muted-foreground uppercase">
            Erkannt · bitte prüfen
          </p>
          <SheetTitle className="sr-only">Gericht prüfen</SheetTitle>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Gericht"
            className="w-full min-w-0 border-0 bg-transparent p-0 font-heading text-xl font-bold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </div>
      </div>

      <ul aria-label="Zutaten">
        {rows.map((row) => (
          <li
            key={row.key}
            data-matched={row.food !== null}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 border-b border-dashed py-2"
          >
            <span className="min-w-0 font-semibold">
              {row.food?.name ?? row.name}
              <small className="block text-xs font-medium text-muted-foreground">
                {row.food ? (
                  <>
                    <span>{TAGS[row.tag]}</span>
                    {" · "}
                    <button
                      type="button"
                      aria-label={`${row.name} tauschen`}
                      onClick={() => setMatching(row.key)}
                      className="font-bold text-primary"
                    >
                      tauschen
                    </button>
                  </>
                ) : (
                  <>
                    <span className="font-bold text-destructive">nicht zugeordnet</span>
                    {" · "}
                    <button
                      type="button"
                      aria-label={`${row.name} zuordnen`}
                      onClick={() => setMatching(row.key)}
                      className="font-bold text-primary"
                    >
                      zuordnen
                    </button>
                  </>
                )}
              </small>
            </span>
            <IngredientGrams name={row.name} grams={row.grams} onChange={(grams) => change(row.key, { grams })} />
            <button
              type="button"
              aria-label={`${row.name} entfernen`}
              onClick={() => remove(row.key)}
              className="size-[30px] text-muted-foreground"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-2 mb-3 text-[12.5px] text-muted-foreground">Mengen sind geschätzt. Fehlt etwas?</p>
      {unmatched > 0 && (
        <p role="status" className="-mt-1 mb-3 text-[12.5px] font-semibold text-destructive">
          Nicht zugeordnete Zutaten werden nicht eingetragen.
        </p>
      )}

      <div role="group" aria-label="Vorschläge" className="mb-[18px] flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMatching("new")}
          className="inline-flex flex-none items-center gap-1.5 rounded-full border border-primary px-3 py-[7px] text-[13px] font-semibold whitespace-nowrap text-primary"
        >
          + Zutat suchen
        </button>
        {suggestions.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => suggest(food)}
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

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onDiscard}
          className="h-[54px] rounded-2xl border px-[18px] font-semibold text-muted-foreground"
        >
          Verwerfen
        </button>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() =>
            onSubmit(
              name.trim(),
              logged.map((row) => ({ food_id: row.food!.id, grams: clampGrams(row.grams) })),
            )
          }
          className="h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground tabular-nums disabled:cursor-not-allowed disabled:opacity-45"
        >
          Eintragen · {fmt(total.kcal)} kcal
        </button>
      </div>
    </>
  );
}

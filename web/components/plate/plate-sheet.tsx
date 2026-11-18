"use client";

import { useCallback, useState, type CSSProperties } from "react";
import Image from "next/image";
import type { Basis, FoodRef, Macros, PlateExtraction, SearchHit } from "@/lib/api";
import { previewMacros } from "@/lib/amount";
import { breakable, fmt } from "@/lib/format";
import { hitArea, kicker } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { DOTS } from "@/components/amount-sheet";
import { clampGrams, IngredientGrams, scaleGrams } from "@/components/ingredient-grams";
import { IngredientSearchField } from "@/components/ingredient-search-field";
import { SearchSheet } from "@/components/search-sheet";
import { SheetTitle, useSheetBack } from "@/components/sheet";

/** "manual": added or matched by hand; the others come from the backend. */
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
 * Result sheet of the plate (prototype openPlate) and of a dictated meal, which has no photo
 * (ADR-0013): photo, name, ingredients with "erkannt" or
 * "vermutet" (from the backend), grams by − and + or typed, remove, a search that matches an
 * unmatched ingredient, swaps a wrong one or adds a new one, the total weight, which spreads
 * a weighed value over the ingredients, and the local preview of the sum (ADR-0003). An
 * unmatched ingredient has no food and is left out; "Eintragen" hands on the matched ones,
 * which become a dish of their own.
 */
export function PlateSheet({
  plate,
  photo,
  busy,
  onSubmit,
  onDiscard,
}: {
  plate: PlateExtraction;
  photo?: Blob;
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
  // While the total is typed: its text and the rows it started from, so that passing through
  // "4" on the way to "425" does not wear the proportions down.
  const [weighing, setWeighing] = useState<{ text: string; from: Row[] } | null>(null);
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
  const totalGrams = rows.reduce((grams, row) => grams + row.grams, 0);
  const ready = name.trim() !== "" && logged.length > 0;

  const weigh = (text: string, from: Row[]) => {
    setWeighing({ text, from });
    const weighed = Math.round(Number(text));
    const grams = from.map((row) => row.grams);
    const scaled = weighed >= 1 ? scaleGrams(grams, weighed) : grams;
    setRows(from.map((row, index) => ({ ...row, grams: scaled[index] })));
  };

  const add = (food: SearchHit, grams: number) =>
    setRows((current) => [
      ...current,
      {
        key: rowKeys++,
        name: food.name,
        grams,
        tag: "manual",
        food: { id: food.id!, name: food.name, brand: food.brand, source: food.source, category: food.category },
        per100: food.per_100,
        basis: food.basis,
        density: food.density,
      },
    ]);

  const match = (hit: SearchHit) => {
    if (hit.id === null || matching === null) return;
    if (matching === "new") {
      add(hit, hit.standard_serving.grams);
      setMatching(null);
      return;
    }
    change(matching, {
      tag: "manual",
      food: { id: hit.id, name: hit.name, brand: hit.brand, source: hit.source, category: hit.category },
      per100: hit.per_100,
      basis: hit.basis,
      density: hit.density,
    });
    setMatching(null);
  };

  // Scrim, Escape and the back button in the search go back to the dish.
  const backToDish = useCallback(() => setMatching(null), []);
  useSheetBack(matching !== null ? backToDish : null);

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
        {photo && (
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
        )}
        <div className="min-w-0 flex-1">
          <p className={cn(kicker, "mb-1")}>
            Erkannt · bitte prüfen
          </p>
          <SheetTitle className="sr-only">Gericht prüfen</SheetTitle>
          {/* A long name wraps instead of being cut: the field grows with its text. */}
          <textarea
            rows={1}
            value={name}
            onChange={(event) => setName(event.target.value.replace(/\n/g, " "))}
            aria-label="Gericht"
            className="block w-full min-w-0 resize-none border-0 bg-transparent p-0 font-heading text-[21px] leading-[1.15] font-bold text-foreground outline-none [field-sizing:content] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
            <span className="min-w-0 leading-snug font-semibold [overflow-wrap:anywhere]">
              {breakable(row.food?.name ?? row.name)}
              <small className="block text-xs font-medium text-muted-foreground">
                {row.food ? (
                  <>
                    <span>{TAGS[row.tag]}</span>
                    {" · "}
                    <button
                      type="button"
                      aria-label={`${row.name} tauschen`}
                      onClick={() => setMatching(row.key)}
                      className="relative font-bold text-primary after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
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
                      className="relative font-bold text-primary after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
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
              className={cn("size-[30px] text-muted-foreground", hitArea)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {rows.length > 0 && (
        <label className="flex items-center justify-between gap-2.5 py-2 pr-[68px]">
          <span className="min-w-0 leading-snug font-semibold">
            Gesamtgewicht
            <small className="block text-xs font-medium text-muted-foreground">
              Gewogen? Hier eintragen.
            </small>
          </span>
          <span className="flex h-[34px] items-center rounded-[9px] border bg-surface-2 px-2 font-bold tabular-nums">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              aria-label="Gesamtgewicht"
              value={weighing ? weighing.text : totalGrams}
              onFocus={(event) => {
                event.target.select();
                setWeighing({ text: String(totalGrams), from: rows });
              }}
              onChange={(event) => weighing && weigh(event.target.value, weighing.from)}
              onBlur={() => setWeighing(null)}
              onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
              className="w-[5ch] [appearance:textfield] border-0 bg-transparent p-0 text-right font-bold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-inner-spin-button]:appearance-none"
            />
            <small className="ml-0.5 text-xs font-semibold text-muted-foreground">g</small>
          </span>
        </label>
      )}

      <p className="mt-2 mb-3 text-[12.5px] text-muted-foreground">Mengen sind geschätzt. Fehlt etwas?</p>
      {plate.notes && (
        <p data-testid="plate-notes" className="-mt-1 mb-3 text-[12.5px] text-muted-foreground">
          Hinweis: {plate.notes}
        </p>
      )}
      {unmatched > 0 && (
        <p role="status" className="-mt-1 mb-3 text-[12.5px] font-semibold text-destructive">
          Nicht zugeordnete Zutaten werden nicht eingetragen.
        </p>
      )}

      <IngredientSearchField onClick={() => setMatching("new")} />

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
          className="h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground tabular-nums disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          Eintragen · {fmt(total.kcal)} kcal
        </button>
      </div>
    </>
  );
}

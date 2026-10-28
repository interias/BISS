"use client";

import { useEffect, useState } from "react";
import { searchFoods, type FoodSummary } from "@/lib/api";
import { brandLine, fmt, per100Unit } from "@/lib/format";
import { FoodPic } from "@/components/food-pic";
import { SheetTitle } from "@/components/sheet";

const DEBOUNCE_MS = 150;

/** Search sheet: input, hits with picture, name, brand and kcal per 100 g, the empty hint. */
export function SearchSheet({ onPick }: { onPick: (food: FoodSummary) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; hits: FoodSummary[] } | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!q) return;
    let live = true;
    const timer = setTimeout(() => {
      searchFoods(q).then((hits) => live && setResult({ query: q, hits }), console.error);
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const hits = q && result?.query === q ? result.hits : null;

  return (
    <>
      <SheetTitle className="sr-only">Lebensmittel suchen</SheetTitle>
      <div className="mb-2.5 grid gap-1">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="z. B. Skyr, Reis, Ei"
          autoComplete="off"
          aria-label="Suchen"
          className="h-[42px] w-full min-w-0 rounded-[10px] border bg-surface-2 px-3 text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>
      <div aria-label="Treffer">
        {hits?.length === 0 && (
          <div className="py-2 text-[13px] text-muted-foreground">
            Nicht gefunden. Packung fotografieren und BISS legt den Eintrag an.
          </div>
        )}
        {hits?.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => onPick(food)}
            className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-px border-b border-dashed py-[9px] text-left last:border-b-0"
          >
            <span className="row-span-2">
              <FoodPic size={40} />
            </span>
            <span className="min-w-0 self-end truncate font-semibold">{food.name}</span>
            <span className="self-end text-right font-bold tabular-nums">{fmt(food.per_100.kcal)}</span>
            <span className="col-[2/-1] min-w-0 self-start text-[12.5px] text-muted-foreground">
              {brandLine(food.brand, food.source)} · kcal je {per100Unit(food.basis)}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

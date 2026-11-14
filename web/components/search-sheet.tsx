"use client";

import { useEffect, useState } from "react";
import { getSuggestions, searchFoods, searchOff, type Combo, type SearchHit, type Suggestion } from "@/lib/api";
import { brandLine, fmt, per100Unit } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FoodPic } from "@/components/food-pic";
import { SheetTitle } from "@/components/sheet";

const DEBOUNCE_MS = 150;
// Open Food Facts allows few searches a minute (ADR-0011): it is asked only once typing
// has paused a little longer than the local search waits.
const OFF_DELAY_MS = 400;

type Off = { query: string; hits: SearchHit[] | null; failed: boolean };

function HitRow({ food, onPick }: { food: SearchHit; onPick: (food: SearchHit) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(food)}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-px border-b border-dashed py-[9px] text-left last:border-b-0"
    >
      <span className="row-span-2">
        <FoodPic size={40} category={food.category} />
      </span>
      {/* An own recipe stands out in the accent colour. */}
      <span className={cn("min-w-0 self-end truncate font-semibold", food.recipe && "text-primary")}>{food.name}</span>
      <span className="self-end text-right font-bold tabular-nums">{fmt(food.per_100.kcal)}</span>
      <span className="col-[2/-1] min-w-0 self-start text-[12.5px] text-muted-foreground">
        {food.recipe ? (
          <b className="mr-1.5 rounded-full bg-primary px-1.5 py-px text-[11px] font-bold text-primary-foreground">
            Rezept
          </b>
        ) : (
          `${brandLine(food.brand, food.source)} · `
        )}
        kcal je {per100Unit(food.basis)}
      </span>
    </button>
  );
}

/** A Schnellzugriff among the suggestions: its sum, and a tap logs it like its chip in the dock. */
function ComboRow({ combo, onPick }: { combo: Combo; onPick: (combo: Combo) => void }) {
  const grams = combo.items.reduce((sum, item) => sum + item.grams, 0);
  return (
    <button
      type="button"
      onClick={() => onPick(combo)}
      className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-px border-b border-dashed py-[9px] text-left last:border-b-0"
    >
      <span className="row-span-2">
        <FoodPic size={40} category="dishes" />
      </span>
      <span className="min-w-0 self-end truncate font-semibold">{combo.name}</span>
      <span className="self-end text-right font-bold tabular-nums">{fmt(combo.totals.kcal)}</span>
      <span className="col-[2/-1] min-w-0 self-start text-[12.5px] text-muted-foreground">
        Schnellzugriff · {fmt(grams)} g · trägt direkt ein
      </span>
    </button>
  );
}

function SuggestionGroup({
  label,
  items,
  onPick,
  onCombo,
}: {
  label: string;
  items: Suggestion[];
  onPick: (food: SearchHit) => void;
  onCombo?: (combo: Combo) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div role="group" aria-label={label}>
      <p className="pt-2 text-[12px] font-semibold text-muted-foreground">{label}</p>
      {items.map((item) =>
        item.combo ? (
          onCombo && <ComboRow key={`combo-${item.combo.id}`} combo={item.combo} onPick={onCombo} />
        ) : (
          <HitRow key={item.food.id ?? item.food.gtin} food={item.food} onPick={onPick} />
        ),
      )}
    </div>
  );
}

/**
 * Search sheet: input, hits with picture, name, brand and kcal per 100 g, the empty hint.
 * Before anything is typed it shows what the backend guesses as the next entry ("Jetzt
 * wahrscheinlich") and below the foods and Schnellzugriffe last used, the latest first. The
 * guesses stay away while they would only repeat the list below. A Schnellzugriff shows only
 * with `onCombo`, which logs it.
 * When the backend says the local search found few hits (`off_more`), the hits of Open Food
 * Facts follow below, with "Suche bei Open Food Facts …" while they load and the source note.
 * `foodsOnly` leaves out the products of Open Food Facts, which have no food yet, and does
 * not ask it; without `onCreate` the sheet does not offer a new food.
 */
export function SearchSheet({
  onPick,
  onCreate,
  onCombo,
  foodsOnly,
}: {
  onPick: (food: SearchHit) => void;
  onCreate?: () => void;
  onCombo?: (combo: Combo) => void;
  foodsOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ query: string; hits: SearchHit[]; offMore: boolean } | null>(null);
  const [off, setOff] = useState<Off | null>(null);
  const [suggested, setSuggested] = useState<{ likely: Suggestion[]; recent: Suggestion[] } | null>(null);
  const q = query.trim();

  useEffect(() => {
    let live = true;
    // Without `onCombo` the sheet picks a food: the Schnellzugriffe are left out.
    const usable = (items: Suggestion[]) => items.filter((item) => item.food || onCombo);
    getSuggestions().then(
      (found) => live && setSuggested({ likely: usable(found.likely), recent: usable(found.recent) }),
      console.error,
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked once per opening
  }, []);

  useEffect(() => {
    if (!q) return;
    let live = true;
    const timer = setTimeout(() => {
      searchFoods(q).then(
        (found) =>
          live &&
          setResult({
            query: q,
            hits: foodsOnly ? found.hits.filter((hit) => hit.id !== null) : found.hits,
            offMore: found.off_more && !foodsOnly,
          }),
        console.error,
      );
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, foodsOnly]);

  const offQuery = result?.offMore ? result.query : null;
  useEffect(() => {
    if (!offQuery) return;
    let live = true;
    const timer = setTimeout(() => {
      setOff({ query: offQuery, hits: null, failed: false });
      searchOff(offQuery).then(
        (found) => live && setOff({ query: offQuery, hits: found.hits, failed: found.reason !== null }),
        (failure) => {
          console.error(failure);
          if (live) setOff({ query: offQuery, hits: [], failed: true });
        },
      );
    }, OFF_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [offQuery]);

  const hits = q && result?.query === q ? result.hits : null;
  // Open Food Facts belongs to the local hits shown; the empty hint waits for its answer.
  const asking = hits !== null && result?.offMore === true;
  const offNow = asking && off?.query === q ? off : null;
  const offHits = offNow?.hits ?? [];
  const settled = !asking || offNow?.hits != null;

  return (
    <>
      <SheetTitle className="sr-only">Lebensmittel suchen</SheetTitle>
      {/* The field stays at the top of the sheet while the hits scroll below it. */}
      <div className="sticky top-0 z-10 -mx-5 mb-2.5 grid gap-1 bg-card px-5 pb-1">
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
        {!q && suggested && (
          <>
            {suggested.recent.length > suggested.likely.length && (
              <SuggestionGroup label="Jetzt wahrscheinlich" items={suggested.likely} onPick={onPick} onCombo={onCombo} />
            )}
            <SuggestionGroup label="Zuletzt" items={suggested.recent} onPick={onPick} onCombo={onCombo} />
          </>
        )}
        {hits?.map((food) => <HitRow key={food.id ?? food.gtin} food={food} onPick={onPick} />)}
        {!settled && (
          <div aria-live="polite" className="py-2.5 text-[13px] text-muted-foreground">
            Suche bei Open Food Facts …
          </div>
        )}
        {offHits.length > 0 && (
          <div role="group" aria-label="Open Food Facts" className="border-t border-dashed">
            {offHits.map((food) => (
              <HitRow key={food.id ?? food.gtin} food={food} onPick={onPick} />
            ))}
            {/* Attribution for data under ODbL (ADR-0002, ADR-0011). */}
            <p className="pt-1 pb-2 text-[12px] text-muted-foreground">Daten von Open Food Facts (ODbL)</p>
          </div>
        )}
        {settled && offNow?.failed && (
          <div className="py-1 text-[12px] text-muted-foreground">Open Food Facts ist gerade nicht erreichbar.</div>
        )}
        {hits?.length === 0 && settled && offHits.length === 0 && (
          <div className="py-2 text-[13px] text-muted-foreground">
            {onCreate ? "Nicht gefunden. Packung fotografieren und BISS legt den Eintrag an." : "Nicht gefunden."}
            {onCreate && (
              <button
                type="button"
                onClick={onCreate}
                className="mt-2.5 h-[42px] w-full rounded-xl border-[1.5px] border-dashed font-bold text-primary"
              >
                Neu anlegen
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

import type { Entry, MealEntries } from "@/lib/api";
import { clockTime, fmt, MEAL_LABELS } from "@/lib/format";
import { FoodPic } from "@/components/food-pic";

/** Diary by meal; a tap on an entry opens it for editing. */
export function Diary({ meals, onOpen }: { meals: MealEntries[]; onOpen: (entry: Entry) => void }) {
  return (
    <section aria-label="Tagebuch">
      {meals.map(({ meal, totals, entries }) => (
        <div key={meal} className="pt-4" data-meal={meal}>
          <h3 className="mb-1 flex justify-between text-[11px] font-bold tracking-[.12em] text-muted-foreground uppercase">
            <span>{MEAL_LABELS[meal]}</span>
            <span className="tabular-nums">{entries.length ? `${fmt(totals.kcal)} kcal` : ""}</span>
          </h3>
          {entries.length ? (
            entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                data-entry-id={entry.id}
                onClick={() => onOpen(entry)}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-px border-b border-dashed py-[9px] text-left last:border-b-0"
              >
                <span className="row-span-2">
                  <FoodPic size={44} />
                </span>
                <span className="min-w-0 self-end truncate font-semibold">{entry.food.name}</span>
                <span className="self-end text-right font-bold tabular-nums">
                  {fmt(entry.macros.kcal)}
                </span>
                <span className="col-[2/-1] min-w-0 self-start text-[12.5px] text-muted-foreground tabular-nums">
                  {`${fmt(entry.grams)} g · ${clockTime(entry.eaten_at)} · E ${fmt(entry.macros.protein)} · K ${fmt(entry.macros.carbs)} · F ${fmt(entry.macros.fat)}`}
                </span>
              </button>
            ))
          ) : (
            <div className="py-2 text-[13px] text-muted-foreground">Noch nichts eingetragen</div>
          )}
        </div>
      ))}
    </section>
  );
}

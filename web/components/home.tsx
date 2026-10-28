"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  createEntry,
  deleteEntry,
  getRecent,
  getToday,
  updateEntry,
  type Day,
  type Entry,
  type FoodSummary,
  type Meal,
} from "@/lib/api";
import { headerDate, shortName } from "@/lib/format";
import { AmountSheet } from "@/components/amount-sheet";
import { DaySummary } from "@/components/day-summary";
import { Diary } from "@/components/diary";
import { Dock } from "@/components/dock";
import { SearchSheet } from "@/components/search-sheet";
import { Sheet } from "@/components/sheet";
import { Toast, useToast } from "@/components/toast";

const load = () => Promise.all([getToday(), getRecent()]);

type SheetState =
  | { kind: "search" }
  | { kind: "amount"; foodId: number; entry?: Entry };

/** The single screen: header, day summary, diary, dock, sheets and the toast. */
export function Home() {
  const [day, setDay] = useState<Day | null>(null);
  const [recent, setRecent] = useState<FoodSummary[]>([]);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show, hide } = useToast();

  // Every change reloads the day from the backend, which computes all values (ADR-0003).
  const apply = useCallback(([today, foods]: [Day, FoodSummary[]]) => {
    setDay(today);
    setRecent(foods);
  }, []);
  const reload = useCallback(() => load().then(apply), [apply]);

  useEffect(() => {
    load().then(apply, console.error);
  }, [apply]);

  /** Runs a write, reloads the day and closes the sheet; the toast follows. */
  const write = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setSheet(null);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const undo = (entryId: number) => () => {
    deleteEntry(entryId).then(reload).catch(console.error);
  };

  const logRecent = async (food: FoodSummary) => {
    // Only the food: the backend takes the standard serving and the suggested meal.
    const entry = await createEntry({ food_id: food.id });
    await reload();
    show(`${shortName(food.name)} eingetragen`, undo(entry.id));
  };

  const submit = (foodId: number, entry: Entry | undefined) => (grams: number, meal: Meal) =>
    write(async () => {
      if (entry) {
        await updateEntry(entry.id, {
          ...(grams !== entry.grams && { grams }),
          ...(meal !== entry.meal && { meal }),
        });
        show("Gespeichert");
      } else {
        const created = await createEntry({ food_id: foodId, grams, meal });
        show(`${shortName(created.food.name)} eingetragen`, undo(created.id));
      }
    }).catch(console.error);

  const remove = (entry: Entry) => () =>
    write(async () => {
      await deleteEntry(entry.id);
      show("Entfernt");
    }).catch(console.error);

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[420px] flex-col overflow-hidden bg-card text-card-foreground sm:my-4 sm:h-[calc(100dvh-32px)] sm:max-h-[880px] sm:rounded-[28px] sm:border sm:border-frame sm:shadow-[0_20px_50px_-20px_var(--biss-shadow)]">
      <header className="flex items-center justify-between px-5 pt-[18px] pb-1.5">
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="" width={26} height={26} priority />
          <h1 className="font-heading text-[22px] font-extrabold tracking-[.06em]">BISS</h1>
        </div>
        <span className="text-[13px] font-semibold text-muted-foreground">
          {day && headerDate(day.date)}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto bg-card px-5 pt-1 pb-3">
        {day && (
          <>
            <DaySummary totals={day.totals} targets={day.targets} />
            <Diary meals={day.meals} onOpen={(entry) => setSheet({ kind: "amount", foodId: entry.food.id, entry })} />
          </>
        )}
      </main>

      <Dock
        recent={recent}
        onRecent={(food) => logRecent(food).catch(console.error)}
        onSearch={() => setSheet({ kind: "search" })}
      />

      {sheet && day && (
        <Sheet onClose={() => setSheet(null)}>
          {sheet.kind === "search" ? (
            <SearchSheet onPick={(food) => setSheet({ kind: "amount", foodId: food.id })} />
          ) : (
            <AmountSheet
              key={sheet.entry?.id ?? `food-${sheet.foodId}`}
              foodId={sheet.foodId}
              entry={sheet.entry}
              suggestedMeal={day.suggested_meal}
              busy={busy}
              onSubmit={submit(sheet.foodId, sheet.entry)}
              onRemove={sheet.entry && remove(sheet.entry)}
            />
          )}
        </Sheet>
      )}

      <Toast toast={toast} onHide={hide} />
    </div>
  );
}

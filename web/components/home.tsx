"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  createCombo,
  createEntry,
  createEntryGroup,
  deleteEntry,
  deleteCombo,
  deleteEntryGroup,
  getCombos,
  getRecent,
  getToday,
  logCombo,
  scanBarcode,
  updateCombo,
  updateEntry,
  type BarcodeFood,
  type Combo,
  type ComboItemWrite,
  type Day,
  type DayGroup,
  type Entry,
  type EntryGroup,
  type FoodDetail,
  type FoodSummary,
  type LabelExtraction,
  type Meal,
  type PlateExtraction,
  type SearchHit,
} from "@/lib/api";
import { fmt, headerDate, shortName } from "@/lib/format";
import { AmountForm, AmountSheet } from "@/components/amount-sheet";
import { Camera } from "@/components/camera/camera";
import { ComboSheet } from "@/components/combo/combo-sheet";
import { DaySummary } from "@/components/day-summary";
import { Diary, type GroupRemoval } from "@/components/diary";
import { Dock } from "@/components/dock";
import { FoodEditor } from "@/components/food-editor";
import { PlateSheet } from "@/components/plate/plate-sheet";
import { SearchSheet } from "@/components/search-sheet";
import { Sheet } from "@/components/sheet";
import { Toast, useToast } from "@/components/toast";

const load = () => Promise.all([getToday(), getRecent(), getCombos()]);

/** The amount sheet with the grams and meal it comes back with from the editor. */
type AmountState = { foodId: number; entry?: Entry; initial?: { grams: number; meal: Meal } };

type SheetState =
  | { kind: "search" }
  | ({ kind: "amount" } & AmountState)
  // A scanned draft from Open Food Facts; its first entry stores it as food.
  | { kind: "draft"; food: BarcodeFood }
  // `back` is the amount sheet "Bearbeiten" came from; a new food has none. `gtin` is a
  // scanned barcode without a hit, `label` the draft read from its label photo.
  | { kind: "editor"; foodId?: number; gtin?: string; label?: LabelExtraction; back?: AmountState }
  // The dish read from a plate photo; nothing is logged before "Eintragen" (SPEC 7a).
  | { kind: "plate"; plate: PlateExtraction; photo: Blob }
  // A Schnellzugriff to adjust for one entry, or a new one without `combo` (ADR-0010).
  | { kind: "combo"; combo?: Combo };

/** The single screen: header, day summary, diary, dock, sheets and the toast. */
export function Home() {
  const [day, setDay] = useState<Day | null>(null);
  const [recent, setRecent] = useState<FoodSummary[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast, show, hide } = useToast();

  // Every change reloads the day from the backend, which computes all values (ADR-0003).
  const apply = useCallback(([today, foods, saved]: [Day, FoodSummary[], Combo[]]) => {
    setDay(today);
    setRecent(foods);
    setCombos(saved);
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

  /** The toast of a logged Schnellzugriff; "Rückgängig" removes the whole group, as for a plate. */
  const comboLogged = (name: string, group: EntryGroup) =>
    show(`${name} eingetragen · ${fmt(group.totals.kcal)} kcal`, () => {
      deleteEntryGroup(group.group_id).then(reload).catch(console.error);
    });

  /** One tap: the template's items, the meal the backend suggests. */
  const tapCombo = async (combo: Combo) => {
    const group = await logCombo(combo.id);
    await reload();
    comboLogged(combo.name, group);
  };

  /** Logs the adjusted items; the template stays as it is. */
  const logAdjusted = (combo: Combo) => (items: ComboItemWrite[], meal: Meal) =>
    write(async () => comboLogged(combo.name, await logCombo(combo.id, { items, meal }))).catch(console.error);

  /** "Als Vorlage speichern" changes the template, "Speichern" of a new one creates it. */
  const saveCombo = (combo?: Combo) => (name: string, items: ComboItemWrite[]) =>
    write(async () => {
      if (combo) await updateCombo(combo.id, { name, items });
      else await createCombo({ name, items });
      show(`${name} als Schnellzugriff gespeichert`);
    }).catch(console.error);

  const removeCombo = (combo: Combo) => () =>
    write(async () => {
      await deleteCombo(combo.id);
      show(`${combo.name} gelöscht`);
    }).catch(console.error);

  /** "als Schnellzugriff merken": the backend copies foods, grams and name of the group. */
  const remember = async (group: DayGroup) => {
    const combo = await createCombo({ group_id: group.group_id });
    await reload();
    show(`${combo.name} als Schnellzugriff gespeichert`);
  };

  /** A draft is logged by its GTIN; the backend stores it as food on this first entry. */
  const submit =
    (target: { food_id: number } | { gtin: string }, entry: Entry | undefined) => (grams: number, meal: Meal) =>
    write(async () => {
      if (entry) {
        await updateEntry(entry.id, {
          ...(grams !== entry.grams && { grams }),
          ...(meal !== entry.meal && { meal }),
        });
        show("Gespeichert");
      } else {
        const created = await createEntry({ ...target, grams, meal });
        show(`${shortName(created.food.name)} eingetragen`, undo(created.id));
      }
    }).catch(console.error);

  const edited = (back?: AmountState) => (food: FoodDetail) => {
    reload().catch(console.error); // names and values in the diary may have changed
    if (back) show("Lebensmittel gespeichert");
    setSheet({ kind: "amount", ...(back ?? { foodId: food.id }) });
  };

  const scanned = (food: BarcodeFood) => {
    setCamera(false);
    setSheet(food.id === null ? { kind: "draft", food } : { kind: "amount", foodId: food.id });
  };

  /** A cached product has no food yet: the barcode chain answers its draft, as after a scan. */
  const picked = (hit: SearchHit) => {
    if (hit.id !== null) setSheet({ kind: "amount", foodId: hit.id });
    else scanBarcode(hit.gtin).then((found) => "food" in found && scanned(found.food), console.error);
  };

  /** A Gericht is logged in one call; "Rückgängig" removes the whole group again. */
  const submitPlate = (name: string, items: { food_id: number; grams: number }[]) =>
    write(async () => {
      const group = await createEntryGroup({ group_name: name, items });
      show(`${name} eingetragen`, () => {
        deleteEntryGroup(group.group_id).then(reload).catch(console.error);
      });
    }).catch(console.error);

  /**
   * Removes a Gericht. "Rückgängig" logs it again with the same name, meal, time and amounts
   * (a new group with new snapshots), like the undo of a recent chip works after the write.
   */
  const removeGroup = async ({ meal, group, entries }: GroupRemoval) => {
    await deleteEntryGroup(group.group_id);
    await reload();
    show(`${group.group_name} entfernt`, () => {
      createEntryGroup({
        group_name: group.group_name,
        meal,
        eaten_at: entries[0].eaten_at,
        items: entries.map((entry) => ({ food_id: entry.food.id, grams: entry.grams })),
      })
        .then(reload)
        .catch(console.error);
    });
  };

  const remove = (entry: Entry) => () =>
    write(async () => {
      await deleteEntry(entry.id);
      show("Entfernt");
    }).catch(console.error);

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[420px] flex-col overflow-hidden bg-card text-card-foreground sm:my-4 sm:h-[calc(100dvh-32px)] sm:max-h-[880px] sm:rounded-[28px] sm:border sm:border-frame sm:shadow-[0_20px_50px_-20px_var(--biss-shadow)]">
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
            <Diary
              meals={day.meals}
              comboNames={combos.map((combo) => combo.name)}
              onOpen={(entry) => setSheet({ kind: "amount", foodId: entry.food.id, entry })}
              onRemoveGroup={(removal) => removeGroup(removal).catch(console.error)}
              onRemember={(group) => remember(group).catch(console.error)}
            />
          </>
        )}
      </main>

      <Dock
        combos={combos}
        recent={recent}
        onCombo={(combo) => tapCombo(combo).catch(console.error)}
        onComboHold={(combo) => setSheet({ kind: "combo", combo })}
        onNewCombo={() => setSheet({ kind: "combo" })}
        onRecent={(food) => logRecent(food).catch(console.error)}
        onSearch={() => setSheet({ kind: "search" })}
        onCamera={() => {
          setSheet(null);
          setCamera(true);
        }}
      />

      {camera && (
        <Camera
          onFound={scanned}
          onLabel={(gtin, label) => {
            setCamera(false);
            setSheet({ kind: "editor", gtin, label });
          }}
          onPlate={(plate, photo) => {
            setCamera(false);
            setSheet({ kind: "plate", plate, photo });
          }}
          onClose={() => setCamera(false)}
        />
      )}

      {sheet && day && (
        <Sheet onClose={() => setSheet(null)}>
          {sheet.kind === "search" && (
            <SearchSheet
              onPick={picked}
              onCreate={() => setSheet({ kind: "editor" })}
            />
          )}
          {sheet.kind === "amount" && (
            <AmountSheet
              key={sheet.entry?.id ?? `food-${sheet.foodId}`}
              foodId={sheet.foodId}
              entry={sheet.entry}
              initial={sheet.initial}
              suggestedMeal={day.suggested_meal}
              busy={busy}
              onSubmit={submit({ food_id: sheet.foodId }, sheet.entry)}
              onRemove={sheet.entry && remove(sheet.entry)}
              onEdit={(grams, meal) =>
                setSheet({
                  kind: "editor",
                  foodId: sheet.foodId,
                  back: { foodId: sheet.foodId, entry: sheet.entry, initial: { grams, meal } },
                })
              }
            />
          )}
          {sheet.kind === "draft" && (
            <AmountForm
              food={sheet.food}
              initialMeal={day.suggested_meal}
              busy={busy}
              onSubmit={submit({ gtin: sheet.food.gtin }, undefined)}
            />
          )}
          {sheet.kind === "plate" && (
            <PlateSheet
              plate={sheet.plate}
              photo={sheet.photo}
              recent={recent}
              busy={busy}
              onSubmit={submitPlate}
              onDiscard={() => setSheet(null)}
            />
          )}
          {sheet.kind === "combo" && (
            <ComboSheet
              key={sheet.combo?.id ?? "new"}
              combo={sheet.combo}
              suggestedMeal={day.suggested_meal}
              recent={recent}
              busy={busy}
              onLog={sheet.combo && logAdjusted(sheet.combo)}
              onSave={saveCombo(sheet.combo)}
              onDelete={sheet.combo && removeCombo(sheet.combo)}
              onCancel={() => setSheet(null)}
            />
          )}
          {sheet.kind === "editor" && (
            <FoodEditor
              key={sheet.foodId ?? "new"}
              foodId={sheet.foodId}
              gtin={sheet.gtin}
              label={sheet.label}
              onSaved={edited(sheet.back)}
              onCancel={() => setSheet(sheet.back ? { kind: "amount", ...sheet.back } : null)}
            />
          )}
        </Sheet>
      )}

      <Toast toast={toast} onHide={hide} />
    </div>
  );
}

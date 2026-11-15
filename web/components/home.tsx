"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  createCombo,
  createEntry,
  createEntryGroup,
  createRecipe,
  deleteEntry,
  deleteCombo,
  deleteEntryGroup,
  dictatePlate,
  getChips,
  getToday,
  logCombo,
  scanBarcode,
  updateCombo,
  updateEntry,
  updateRecipe,
  uploadFoodImage,
  type BarcodeFood,
  type Chip,
  type Combo,
  type ComboItemWrite,
  type Day,
  type DayGroupRow,
  type Entry,
  type EntryGroup,
  type FoodDetail,
  type FoodSummary,
  type LabelExtraction,
  type PlateExtraction,
  type Recipe,
  type SearchHit,
} from "@/lib/api";
import { canDictate, newRecognition, transcript, type Recognition } from "@/lib/dictation";
import { fmt, headerDate, shortName } from "@/lib/format";
import { AmountForm, AmountSheet } from "@/components/amount-sheet";
import { Camera, type Known } from "@/components/camera/camera";
import { ComboSheet } from "@/components/combo/combo-sheet";
import { DaySummary } from "@/components/day-summary";
import { DictationSheet } from "@/components/dictation-sheet";
import { Diary } from "@/components/diary";
import { Dock } from "@/components/dock";
import { FoodEditor } from "@/components/food-editor";
import { PlateSheet } from "@/components/plate/plate-sheet";
import { RecipeSheet } from "@/components/recipe/recipe-sheet";
import { RecipesSheet } from "@/components/recipe/recipes-sheet";
import { SearchSheet } from "@/components/search-sheet";
import { Sheet } from "@/components/sheet";
import { Toast, useToast } from "@/components/toast";

const load = () => Promise.all([getToday(), getChips()]);

const DICTATION_OFF = "Das Mikrofon ist aus. Erlaube es im Browser.";
const DICTATION_FAILED = "Diktat hat nicht geklappt.";
const noSubscription = () => () => {};

/**
 * The amount sheet with the grams it comes back with from the editor. With `groupId` the new
 * entry joins that Gericht of the diary. `refresh`: the food was just changed, so "Speichern"
 * takes a new snapshot of the entry even for the same grams.
 */
type AmountState = {
  foodId: number;
  entry?: Entry;
  initial?: { grams: number };
  groupId?: string;
  refresh?: boolean;
};

type SheetState =
  // With `groupId` the search picks one more ingredient for that Gericht.
  | { kind: "search"; groupId?: string }
  | ({ kind: "amount" } & AmountState)
  // A scanned draft from Open Food Facts; its first entry stores it as food.
  | { kind: "draft"; food: BarcodeFood }
  // `back` is the amount sheet "Bearbeiten" came from; a new food has none. `gtin` is a
  // scanned barcode without a hit, `label` the draft read from its label photo, `known` the
  // name and brand Open Food Facts has for it, `photo` the label photo as the product photo.
  | {
      kind: "editor";
      foodId?: number;
      gtin?: string;
      label?: LabelExtraction;
      known?: Known;
      photo?: Blob;
      back?: AmountState;
    }
  // The dish read from a plate photo or a dictated sentence (without `photo`); nothing is
  // stored before "Eintragen" (SPEC 7a, ADR-0013).
  | { kind: "plate"; plate: PlateExtraction; photo?: Blob }
  // Listening to a dictated meal, then `reading` the sentence in the backend (ADR-0013).
  | { kind: "dictation"; heard: string; reading: boolean }
  // A Schnellzugriff to adjust for one entry, or a new one without `combo` (ADR-0010).
  | { kind: "combo"; combo?: Combo }
  // A new recipe, or the one of the amount sheet "Bearbeiten" came from (ADR-0012).
  | { kind: "recipe"; recipeId?: number; back?: AmountState }
  // "Meine Rezepte": all recipes, to log one or to start a new one.
  | { kind: "recipes" };

/** The single screen: header, day summary, diary, dock, sheets and the toast. */
export function Home() {
  const [day, setDay] = useState<Day | null>(null);
  // The dock's row: Schnellzugriffe and recent foods, the latest used first.
  const [chips, setChips] = useState<Chip[]>([]);
  const recent = chips.flatMap((chip) => (chip.food ? [chip.food] : []));
  const combos = chips.flatMap((chip) => (chip.combo ? [chip.combo] : []));
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  // The first load failed: without the backend the screen would stay empty without a word.
  const [offline, setOffline] = useState(false);
  const { toast, show, hide } = useToast();
  // The dish of the open plate sheet once it is stored: a second try after a failure updates
  // it instead of storing it twice.
  const plateDish = useRef<{ plate: PlateExtraction; recipe: Recipe } | null>(null);
  // Without speech recognition in the browser there is no microphone (ADR-0013).
  const dictation = useSyncExternalStore(noSubscription, canDictate, () => false);
  // The running recognition; `discard` once its sheet is closed, so nothing is sent.
  const recording = useRef<{ recognition: Recognition; discard: boolean } | null>(null);
  // Counts closed dictation sheets: an answer for a sheet that is gone opens nothing.
  const dictationRun = useRef(0);

  // Every change reloads the day from the backend, which computes all values (ADR-0003).
  const apply = useCallback(([today, row]: [Day, Chip[]]) => {
    setDay(today);
    setChips(row);
  }, []);
  const reload = useCallback(() => load().then(apply), [apply]);

  /** Loads the day and says so when the backend does not answer. */
  const start = useCallback(
    () =>
      load().then(
        (loaded) => {
          apply(loaded);
          setOffline(false);
        },
        (failure) => {
          console.error(failure);
          setOffline(true);
        },
      ),
    [apply],
  );

  useEffect(() => {
    start();
  }, [start]);

  // A phone keeps the page open over night: back in front it shows the current day again.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") start();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [start]);

  // The back button of the phone closes the sheet or the camera instead of leaving the app:
  // an open one stands on a history entry of its own. Closed by a tap, the entry stays and
  // is used again, so at most one is ever left over.
  const overlay = sheet !== null || camera;
  useEffect(() => {
    if (!overlay) return;
    if (window.history.state?.biss !== "overlay") window.history.pushState({ biss: "overlay" }, "");
    const close = () => {
      setSheet(null);
      setCamera(false);
    };
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, [overlay]);

  // Closing the dictation sheet (scrim, Escape, back button) ends the listening unsent.
  const listening = sheet?.kind === "dictation";
  useEffect(() => {
    if (listening) return;
    dictationRun.current++;
    if (recording.current) {
      recording.current.discard = true;
      recording.current.recognition.abort();
      recording.current = null;
    }
  }, [listening]);

  /** A failed call is said, not only logged: otherwise a tap seems to do nothing. */
  const fail = useCallback(
    (failure: unknown) => {
      console.error(failure);
      show("Das hat nicht geklappt. Verbindung prüfen.");
    },
    [show],
  );

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
    deleteEntry(entryId).then(reload).catch(fail);
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
      deleteEntryGroup(group.group_id).then(reload).catch(fail);
    });

  /** One tap: the template's items, the meal the backend suggests. */
  const tapCombo = async (combo: Combo) => {
    const group = await logCombo(combo.id);
    await reload();
    comboLogged(combo.name, group);
  };

  /** Logs the adjusted items; the template stays as it is. */
  const logAdjusted = (combo: Combo) => (items: ComboItemWrite[]) =>
    write(async () => comboLogged(combo.name, await logCombo(combo.id, { items }))).catch(fail);

  /** "Als Vorlage speichern" changes the template, "Speichern" of a new one creates it. */
  const saveCombo = (combo?: Combo) => (name: string, items: ComboItemWrite[]) =>
    write(async () => {
      if (combo) await updateCombo(combo.id, { name, items });
      else await createCombo({ name, items });
      show(`${name} als Schnellzugriff gespeichert`);
    }).catch(fail);

  const removeCombo = (combo: Combo) => () =>
    write(async () => {
      await deleteCombo(combo.id);
      show(`${combo.name} gelöscht`);
    }).catch(fail);

  /** "als Schnellzugriff merken": the backend copies foods, grams and name of the group. */
  const remember = async (group: DayGroupRow) => {
    const combo = await createCombo({ group_id: group.group_id });
    await reload();
    show(`${combo.name} als Schnellzugriff gespeichert`);
  };

  /**
   * A draft is logged by its GTIN; the backend stores it as food on this first entry. The
   * meal is the backend's suggestion; the app does not show meals.
   */
  const submit =
    (target: { food_id: number; group_id?: string } | { gtin: string }, entry: Entry | undefined, refresh = false) =>
    (grams: number) =>
    write(async () => {
      if (entry) {
        if (grams !== entry.grams || refresh) await updateEntry(entry.id, { grams });
        show("Gespeichert");
      } else {
        const created = await createEntry({ ...target, grams });
        show(`${shortName(created.food.name)} eingetragen`, undo(created.id));
      }
    }).catch(fail);

  const edited = (back?: AmountState) => (food: FoodDetail) => {
    reload().catch(fail); // names and values in the diary may have changed
    if (back) show("Lebensmittel gespeichert");
    setSheet({ kind: "amount", ...(back ? { ...back, refresh: true } : { foodId: food.id }) });
  };

  /**
   * A saved recipe leads to the amount sheet of its food, ready to log portions. Back from
   * "Bearbeiten" the amount keeps its number of portions when a portion now weighs more or less.
   */
  const recipeSaved = (back?: AmountState) => (recipe: Recipe, before?: Recipe) => {
    reload().catch(fail); // names and values in the diary may have changed
    show("Rezept gespeichert");
    if (!back) return setSheet({ kind: "amount", foodId: recipe.food_id });
    const grams =
      back.initial && before
        ? Math.round((back.initial.grams / before.portion_grams) * recipe.portion_grams * 10) / 10
        : undefined;
    setSheet({ kind: "amount", ...back, initial: grams ? { grams } : back.initial, refresh: true });
  };

  const scanned = (food: BarcodeFood) => {
    setCamera(false);
    setSheet(food.id === null ? { kind: "draft", food } : { kind: "amount", foodId: food.id });
  };

  /** A cached product has no food yet: the barcode chain answers its draft, as after a scan. */
  const picked = (groupId?: string) => (hit: SearchHit) => {
    if (hit.id !== null) setSheet({ kind: "amount", foodId: hit.id, groupId });
    else scanBarcode(hit.gtin).then((found) => "food" in found && scanned(found.food), fail);
  };

  /**
   * A plate becomes a dish of its own: a recipe of one portion with the plate photo, logged
   * as one entry of that portion, a dictated plate likewise without a photo. So it can be counted ("2 × 1 Portion"), changed and found
   * again like any recipe. "Rückgängig" removes the entry; the dish stays.
   */
  const submitPlate = (
    plate: PlateExtraction,
    photo: Blob | undefined,
    name: string,
    items: { food_id: number; grams: number }[],
  ) =>
    write(async () => {
      const body = { name, description: "", items, portions: 1, cooked_grams: null };
      const stored = plateDish.current?.plate === plate ? plateDish.current.recipe : null;
      const recipe = stored ? await updateRecipe(stored.id, body) : await createRecipe(body);
      plateDish.current = { plate, recipe };
      // The dish counts without its photo too; a dictated one has none.
      if (photo) await uploadFoodImage(recipe.food_id, photo).catch(console.error);
      // Without grams: the standard serving, which is the one portion.
      const entry = await createEntry({ food_id: recipe.food_id });
      show(`${name} eingetragen`, undo(entry.id));
    }).catch(fail);

  /** The heard sentence goes to the backend; its dish opens the plate sheet. */
  const readDictation = async (text: string) => {
    const run = dictationRun.current;
    setSheet({ kind: "dictation", heard: text, reading: true });
    try {
      const plate = await dictatePlate(text);
      if (run !== dictationRun.current) return;
      if (plate.items.length === 0) {
        setSheet(null);
        show(plate.notes || "Kein Lebensmittel verstanden.");
      } else setSheet({ kind: "plate", plate });
    } catch (failure) {
      if (run !== dictationRun.current) return;
      setSheet(null);
      fail(failure);
    }
  };

  /**
   * Tap 1 (the microphone) starts listening, "Fertig" stops it; the end of the recognition,
   * also after a pause or a time limit, sends what was heard. An error never sends (ADR-0013).
   */
  const dictate = () => {
    const recognition = newRecognition();
    const session = { recognition, discard: false };
    const heard = transcript();
    let failed = false;
    recognition.onresult = (event) => {
      if (session.discard) return;
      const text = heard.hear(event);
      setSheet((current) => (current?.kind === "dictation" ? { ...current, heard: text } : current));
    };
    recognition.onerror = ({ error }) => {
      if (session.discard || error === "aborted" || error === "no-speech") return;
      failed = true;
      show(error === "not-allowed" || error === "service-not-allowed" ? DICTATION_OFF : DICTATION_FAILED);
    };
    recognition.onend = () => {
      if (session.discard) return;
      recording.current = null;
      const text = heard.sentence();
      if (failed || !text) setSheet(null);
      else void readDictation(text);
    };
    // start() runs inside the tap, before anything is awaited.
    try {
      recognition.start();
    } catch {
      show(DICTATION_FAILED);
      return;
    }
    recording.current = session;
    setSheet({ kind: "dictation", heard: "", reading: false });
  };

  /**
   * Removes a Gericht. "Rückgängig" logs it again with the same name, meal, time and amounts
   * (a new group with new snapshots), like the undo of a recent chip works after the write.
   */
  const removeGroup = async (group: DayGroupRow) => {
    await deleteEntryGroup(group.group_id);
    await reload();
    show(`${group.group_name} entfernt`, () => {
      createEntryGroup({
        group_name: group.group_name,
        meal: group.meal,
        eaten_at: group.eaten_at,
        items: group.entries.map((entry) => ({ food_id: entry.food.id, grams: entry.grams })),
      })
        .then(reload)
        .catch(fail);
    });
  };

  const remove = (entry: Entry) => () =>
    write(async () => {
      await deleteEntry(entry.id);
      show("Entfernt");
    }).catch(fail);

  return (
    // On a phone the app is pinned to the screen: only the diary and the sheets scroll, the
    // page never does, so the dock with the search always stays at the bottom.
    <div className="mx-auto flex w-full max-w-[420px] flex-col overflow-hidden bg-card text-card-foreground max-sm:fixed max-sm:inset-0 sm:relative sm:my-4 sm:h-[calc(100dvh-32px)] sm:max-h-[880px] sm:rounded-[28px] sm:border sm:border-frame sm:shadow-[0_20px_50px_-20px_var(--biss-shadow)]">
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
        {!day && offline && (
          <div role="alert" className="grid justify-items-center gap-3 pt-16 text-center text-sm text-muted-foreground">
            <p>BISS ist gerade nicht erreichbar.</p>
            <button type="button" onClick={start} className="h-11 rounded-xl border px-5 font-bold text-primary">
              Erneut versuchen
            </button>
          </div>
        )}
        {day && (
          <>
            <DaySummary totals={day.totals} targets={day.targets} />
            <Diary
              rows={day.rows}
              comboNames={combos.map((combo) => combo.name)}
              onOpen={(entry) => setSheet({ kind: "amount", foodId: entry.food.id, entry })}
              onAddToGroup={(group) => setSheet({ kind: "search", groupId: group.group_id })}
              onRemoveGroup={(removal) => removeGroup(removal).catch(fail)}
              onRemember={(group) => remember(group).catch(fail)}
            />
          </>
        )}
      </main>

      <Dock
        chips={chips}
        onCombo={(combo) => tapCombo(combo).catch(fail)}
        onComboHold={(combo) => setSheet({ kind: "combo", combo })}
        onNewCombo={() => setSheet({ kind: "combo" })}
        onRecipes={() => setSheet({ kind: "recipes" })}
        onRecent={(food) => logRecent(food).catch(fail)}
        onSearch={() => setSheet({ kind: "search" })}
        onDictate={dictation ? dictate : undefined}
        onCamera={() => {
          setSheet(null);
          setCamera(true);
        }}
      />

      {camera && (
        <Camera
          onFound={scanned}
          onLabel={(gtin, label, known, photo) => {
            setCamera(false);
            setSheet({ kind: "editor", gtin, label, known, photo });
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
              key={sheet.groupId ?? "search"}
              onPick={picked(sheet.groupId)}
              // An ingredient of a Gericht is a food there is already.
              foodsOnly={sheet.groupId !== undefined}
              onCreate={sheet.groupId === undefined ? () => setSheet({ kind: "editor" }) : undefined}
              // A Schnellzugriff among the suggestions is logged like its chip in the dock.
              onCombo={sheet.groupId === undefined ? (combo) => write(() => tapCombo(combo)).catch(fail) : undefined}
            />
          )}
          {sheet.kind === "amount" && (
            <AmountSheet
              key={sheet.entry?.id ?? `food-${sheet.foodId}`}
              foodId={sheet.foodId}
              entry={sheet.entry}
              initial={sheet.initial}
              busy={busy}
              onSubmit={submit({ food_id: sheet.foodId, group_id: sheet.groupId }, sheet.entry, sheet.refresh)}
              onRemove={sheet.entry && remove(sheet.entry)}
              onEdit={(grams, recipeId) => {
                const back = { foodId: sheet.foodId, entry: sheet.entry, initial: { grams }, groupId: sheet.groupId };
                setSheet(
                  recipeId === undefined
                    ? { kind: "editor", foodId: sheet.foodId, back }
                    : { kind: "recipe", recipeId, back },
                );
              }}
            />
          )}
          {sheet.kind === "draft" && (
            <AmountForm
              food={sheet.food}
              busy={busy}
              onSubmit={submit({ gtin: sheet.food.gtin }, undefined)}
            />
          )}
          {sheet.kind === "dictation" && (
            <DictationSheet
              heard={sheet.heard}
              reading={sheet.reading}
              onStop={() => recording.current?.recognition.stop()}
            />
          )}
          {sheet.kind === "plate" && (
            <PlateSheet
              plate={sheet.plate}
              photo={sheet.photo}
              recent={recent}
              busy={busy}
              onSubmit={(name, items) => submitPlate(sheet.plate, sheet.photo, name, items)}
              onDiscard={() => setSheet(null)}
            />
          )}
          {sheet.kind === "combo" && (
            <ComboSheet
              key={sheet.combo?.id ?? "new"}
              combo={sheet.combo}
              recent={recent}
              busy={busy}
              onLog={sheet.combo && logAdjusted(sheet.combo)}
              onSave={saveCombo(sheet.combo)}
              onDelete={sheet.combo && removeCombo(sheet.combo)}
              onCancel={() => setSheet(null)}
            />
          )}
          {sheet.kind === "recipes" && (
            <RecipesSheet
              onPick={(recipe) => setSheet({ kind: "amount", foodId: recipe.food_id })}
              onNew={() => setSheet({ kind: "recipe" })}
            />
          )}
          {sheet.kind === "recipe" && (
            <RecipeSheet
              key={sheet.recipeId ?? "new"}
              recipeId={sheet.recipeId}
              recent={recent}
              onSaved={recipeSaved(sheet.back)}
              onCancel={() => setSheet(sheet.back ? { kind: "amount", ...sheet.back } : null)}
            />
          )}
          {sheet.kind === "editor" && (
            <FoodEditor
              key={sheet.foodId ?? "new"}
              foodId={sheet.foodId}
              gtin={sheet.gtin}
              label={sheet.label}
              known={sheet.known}
              labelPhoto={sheet.photo}
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

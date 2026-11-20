"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ApiError,
  createRecipe,
  getRecipe,
  imageUrl,
  importRecipe,
  updateRecipe,
  uploadFoodImage,
  type Basis,
  type FoodSummary,
  type Macros,
  type PlateItem,
  type Recipe,
  type RecipeImport,
  type SearchHit,
} from "@/lib/api";
import { previewMacros } from "@/lib/amount";
import { breakable, fmt } from "@/lib/format";
import { hitArea, kicker, primaryOff } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ai-mark";
import { DOTS } from "@/components/amount-sheet";
import { PhotoPicker } from "@/components/photo-picker";
import { clampGrams, IngredientGrams } from "@/components/ingredient-grams";
import { IngredientSearchField } from "@/components/ingredient-search-field";
import { SearchSheet } from "@/components/search-sheet";
import { SheetTitle, useSheetBack } from "@/components/sheet";

/** An ingredient of a whole pot (the API's limit). */
const MAX_ITEM_GRAMS = 10_000;
const MAX_PORTIONS = 100;
const MAX_COOKED_GRAMS = 50_000;

/**
 * A weight as typed in German: "450,5" and "1.200" (thousands) as well as "450.5". NaN for
 * what is no number.
 */
export function parseWeight(text: string) {
  const t = text.replace(/\s/g, "");
  const german = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t);
  return Number(german ? t.replace(/\./g, "").replace(",", ".") : t.replace(",", "."));
}
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // the API's limit, checked early for a clear message

type Row = {
  key: number;
  food: { id: number; name: string; basis: Basis; per_100: Macros };
  density: number;
  grams: number;
};

/** An imported ingredient no food matched (ADR-0014): shown, searched, never dropped silently. */
type Open = { key: number; name: string; grams: number };

let rowKeys = 0;

const rowOf = (food: FoodSummary | SearchHit, grams: number): Row => ({
  key: rowKeys++,
  food: { id: food.id!, name: food.name, basis: food.basis, per_100: food.per_100 },
  density: food.density,
  grams,
});

/**
 * What the sheet holds, kept in the browser while it differs from the saved recipe: closed by
 * accident (scrim, Escape, back button, reload), it opens again as it was. Not the photo.
 */
type Draft = { name: string; description: string; rows: Row[]; portions: number; cooked: string; open: Open[] };

const draftKey = (recipe?: { id: number }) => `biss.recipe-draft.${recipe?.id ?? "new"}`;

/**
 * The name of the draft kept for a recipe, or for a new one without id ("" when it has none
 * yet); null without a draft. "Meine Rezepte" shows it, so an unsaved recipe is found again.
 */
export function draftName(recipeId?: number): string | null {
  try {
    const text = window.localStorage.getItem(draftKey(recipeId === undefined ? undefined : { id: recipeId }));
    return text ? ((JSON.parse(text) as Draft).name ?? "") : null;
  } catch {
    return null;
  }
}

/** What a save writes, to see whether another tab or device saved the recipe meanwhile. */
const stored = (recipe: Recipe) =>
  JSON.stringify([
    recipe.name,
    recipe.description,
    recipe.portions,
    recipe.cooked_grams,
    recipe.items.map((item) => [item.food.id, item.grams]),
  ]);

/** The draft without the row keys, to compare it with the saved recipe. */
const content = (draft: Draft) =>
  JSON.stringify({
    ...draft,
    rows: draft.rows.map(({ food, grams }) => [food.id, grams]),
    open: draft.open.map(({ name, grams }) => [name, grams]),
  });

function readDraft(key: string): Draft | null {
  try {
    const text = window.localStorage.getItem(key);
    if (!text) return null;
    const draft = JSON.parse(text) as Draft;
    // New keys, so rows added later do not take the key of a restored one.
    return {
      ...draft,
      rows: draft.rows.map((row) => ({ ...row, key: rowKeys++ })),
      open: draft.open.map((item) => ({ ...item, key: rowKeys++ })),
    };
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(key, JSON.stringify(draft));
    else window.localStorage.removeItem(key);
  } catch {
    // Without storage the sheet works as before, only without the draft.
  }
}

const importedRow = (item: PlateItem): Row => ({
  key: rowKeys++,
  food: { id: item.food_id!, name: item.food!.name, basis: item.basis!, per_100: item.per_100! },
  density: item.density ?? 1,
  grams: item.grams,
});

/** What went wrong with an import, in words for the sheet. */
function importFailure(failure: unknown, link: boolean) {
  if (failure instanceof ApiError && link && failure.status === 422)
    return "Dieser Link geht nicht. Füge den Rezepttext ein.";
  if (failure instanceof ApiError && link && failure.status === 502)
    return "Die Seite ließ sich nicht lesen. Füge den Rezepttext ein.";
  return "Rezept nicht erkannt. Versuch es noch einmal.";
}

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** Local preview of the whole dish (ADR-0003); the backend computes the stored values. */
const sum = (rows: Row[]) =>
  rows.reduce((total, row) => {
    const m = previewMacros(row.food.per_100, row.grams, row.food.basis, row.density);
    return {
      kcal: total.kcal + m.kcal,
      protein: total.protein + m.protein,
      carbs: total.carbs + m.carbs,
      fat: total.fat + m.fat,
    };
  }, ZERO);

const label = "text-xs font-bold text-muted-foreground";
const field =
  "h-[42px] w-full min-w-0 rounded-[10px] border bg-surface-2 px-3 text-foreground tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Rezept (ADR-0012): an own dish from raw ingredients. The portions divide it, and the
 * weight of the finished dish, weighed after baking or frying, says how much 100 g of it
 * carry; without it the sum of the ingredients stands in, as for a soup. Saving makes or
 * updates the recipe's food, which is logged in portions like any food. With `recipeId` it
 * edits that recipe.
 */
export function RecipeSheet({
  recipeId,
  importing = false,
  onSaved,
  onCancel,
}: {
  recipeId?: number;
  /** Opens with the field for a recipe text or link (ADR-0014), from "Meine Rezepte". */
  importing?: boolean;
  /** The saved recipe and, when it was edited, the recipe as it was before. */
  onSaved: (recipe: Recipe, before?: Recipe) => void;
  onCancel: () => void;
}) {
  const [loaded, setLoaded] = useState<Recipe | null>(null);
  useEffect(() => {
    if (recipeId === undefined) return;
    let live = true;
    getRecipe(recipeId).then((recipe) => live && setLoaded(recipe), console.error);
    return () => {
      live = false;
    };
  }, [recipeId]);

  if (recipeId !== undefined && !loaded) return <SheetTitle className="sr-only">Rezept bearbeiten</SheetTitle>;
  return <RecipeForm recipe={loaded ?? undefined} importing={importing} onSaved={onSaved} onCancel={onCancel} />;
}

function RecipeForm({
  recipe,
  importing,
  onSaved,
  onCancel,
}: {
  recipe?: Recipe;
  importing: boolean;
  onSaved: (recipe: Recipe, before?: Recipe) => void;
  onCancel: () => void;
}) {
  const key = draftKey(recipe);
  const [saved] = useState<Draft>(() => ({
    name: recipe?.name ?? "",
    description: recipe?.description ?? "",
    rows: recipe?.items.map((item) => rowOf(item.food, item.grams)) ?? [],
    portions: recipe?.portions ?? 1,
    // Empty: not weighed.
    cooked: recipe?.cooked_grams ? String(recipe.cooked_grams) : "",
    open: [],
  }));
  const [start] = useState(() => readDraft(key));
  const [restored, setRestored] = useState(start !== null);
  const first = start ?? saved;
  // The last saved state: after a save whose photo upload failed, a retry must update.
  const [base, setBase] = useState(recipe);
  const [name, setName] = useState(first.name);
  const [description, setDescription] = useState(first.description);
  const [rows, setRows] = useState<Row[]>(first.rows);
  const [portions, setPortions] = useState(first.portions);
  const [cooked, setCooked] = useState(first.cooked);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [searching, setSearching] = useState<number | "new" | { open: number } | null>(null);
  const [open, setOpen] = useState<Open[]>(first.open);
  // Import from a text or a link (ADR-0014): null while closed, else the text being written.
  const [source, setSource] = useState<string | null>(importing ? "" : null);
  const [reading, setReading] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  // A second tap before the button turns grey must not create the recipe twice.
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // The recipe was saved elsewhere since it was opened: "Trotzdem speichern" overwrites it.
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    const now = { name, description, rows, portions, cooked, open };
    writeDraft(key, content(now) === content(saved) ? null : now);
  }, [key, saved, name, description, rows, portions, cooked, open]);

  // Scrim, Escape and the back button in the search go back to the recipe, as
  // "← Zurück zum Rezept" does, instead of closing the sheet.
  const backToRecipe = useCallback(() => setSearching(null), []);
  useSheetBack(searching !== null ? backToRecipe : null);

  const discard = () => {
    setName(saved.name);
    setDescription(saved.description);
    setRows(saved.rows);
    setPortions(saved.portions);
    setCooked(saved.cooked);
    setOpen([]);
    setNotes("");
    setRestored(false);
  };

  useEffect(() => {
    const url = photo?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  const change = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: number) => setRows((current) => current.filter((row) => row.key !== key));
  const add = (food: SearchHit) => setRows((current) => [...current, rowOf(food, food.standard_serving.grams)]);

  const pickFood = (hit: SearchHit) => {
    if (hit.id === null || searching === null) return;
    if (searching === "new") add(hit);
    else if (typeof searching === "object") {
      const item = open.find((o) => o.key === searching.open);
      if (item) setRows((current) => [...current, rowOf(hit, item.grams)]);
      setOpen((current) => current.filter((o) => o.key !== searching.open));
    } else change(searching, { food: rowOf(hit, 0).food, density: hit.density });
    setSearching(null);
  };

  /** Fills what is still empty and adds the ingredients; nothing is saved yet. */
  const apply = (found: RecipeImport) => {
    if (!name.trim()) setName(found.name);
    if (!description.trim()) setDescription(found.description);
    if (rows.length === 0) setPortions(Math.min(MAX_PORTIONS, Math.max(1, found.portions)));
    const matched = found.items.filter((item) => item.food_id !== null && item.food && item.per_100);
    setRows((current) => [...current, ...matched.map(importedRow)]);
    setOpen((current) => [
      ...current,
      ...found.items
        .filter((item) => !matched.includes(item))
        .map((item) => ({ key: rowKeys++, name: item.name, grams: item.grams })),
    ]);
    setNotes(found.notes);
  };

  const read = async () => {
    const text = (source ?? "").trim();
    if (!text) return;
    setReading(true);
    setError(null);
    try {
      const found = await importRecipe(text);
      if (found.items.length === 0) setError(found.notes || "Kein Rezept erkannt.");
      else {
        apply(found);
        setSource(null);
      }
    } catch (failure) {
      console.error(failure);
      setError(importFailure(failure, /^https?:\/\/\S+$/i.test(text)));
    } finally {
      setReading(false);
    }
  };

  const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // the same file can be chosen again
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return setError("Das Foto ist größer als 10 MB.");
    setError(null);
    setPhoto({ file, url: URL.createObjectURL(file) });
  };

  const raw = rows.reduce((grams, row) => grams + row.grams, 0);
  const typed = parseWeight(cooked);
  // A typed weight that is no weight is said under the field and blocks saving.
  const cookedWrong = cooked.trim() !== "" && !(typed > 0 && typed <= MAX_COOKED_GRAMS);
  const cookedGrams = cookedWrong ? 0 : typed || 0;
  const finished = cookedGrams > 0 ? cookedGrams : raw;
  const total = sum(rows);
  const perPortion = {
    kcal: total.kcal / portions,
    protein: total.protein / portions,
    carbs: total.carbs / portions,
    fat: total.fat / portions,
  };
  const ready = name.trim() !== "" && rows.length > 0 && !cookedWrong;

  const save = async (force = false) => {
    if (saving.current) return;
    saving.current = true;
    try {
      await store(force);
    } finally {
      saving.current = false;
    }
  };

  const store = async (force: boolean) => {
    setBusy(true);
    setError(null);
    setConflict(false);
    const body = {
      name: name.trim(),
      description: description.trim(),
      items: rows.map((row) => ({ food_id: row.food.id, grams: clampGrams(row.grams, MAX_ITEM_GRAMS) })),
      portions,
      cooked_grams: cookedGrams > 0 ? cookedGrams : null,
    };
    let saved: Recipe;
    try {
      // A second tab or device may have saved this recipe since: never overwrite that unseen.
      if (base && !force && stored(await getRecipe(base.id)) !== stored(base)) {
        setError("Das Rezept wurde inzwischen woanders geändert.");
        setConflict(true);
        setBusy(false);
        return;
      }
      saved = base ? await updateRecipe(base.id, body) : await createRecipe(body);
    } catch (failure) {
      console.error(failure);
      setError("Speichern fehlgeschlagen.");
      setBusy(false);
      return;
    }
    if (photo) {
      try {
        saved = { ...saved, image_path: (await uploadFoodImage(saved.food_id, photo.file)).image_path };
      } catch (failure) {
        console.error(failure);
        // Saved without the photo: a later try updates this recipe, so no duplicate arises.
        setBase(saved);
        setError("Gespeichert, aber das Foto ging nicht (JPEG, PNG oder WebP bis 10 MB).");
        setBusy(false);
        return;
      }
    }
    writeDraft(key, null);
    onSaved(saved, recipe);
  };

  if (searching !== null) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSearching(null)}
          className="mb-2 h-9 text-sm font-semibold text-muted-foreground"
        >
          ← Zurück zum Rezept
        </button>
        <SearchSheet
          foodsOnly
          onPick={pickFood}
          initialQuery={typeof searching === "object" ? open.find((o) => o.key === searching.open)?.name : undefined}
        />
      </>
    );
  }

  const photoSrc = photo?.url ?? (base?.image_path ? imageUrl(base.image_path) : null);

  return (
    <>
      <SheetTitle className={cn(kicker, "mb-2")}>
        {recipe ? "Rezept bearbeiten" : "Neues Rezept"}
      </SheetTitle>

      {restored && (
        <p role="status" className="mb-2.5 text-[12.5px] font-semibold text-muted-foreground">
          Entwurf von vorhin ·{" "}
          {/* A new recipe starts empty again; "Verwerfen" below closes it. */}
          <button type="button" onClick={discard} className="font-bold text-primary">
            {recipe ? "Verwerfen" : "Neu anfangen"}
          </button>
        </p>
      )}
      {source !== null && (
        <div className="mb-3 grid gap-2">
          <label htmlFor="recipe-source" className={cn(label, "flex items-center gap-1")}>
            <AiMark size={12} />
            Rezepttext oder Link
          </label>
          <textarea
            id="recipe-source"
            autoFocus
            value={source}
            onChange={(event) => setSource(event.target.value)}
            rows={4}
            placeholder="Rezept einfügen oder Link, z. B. von Chefkoch"
            className={`${field} h-auto min-h-[96px] py-2`}
          />
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setSource(null)}
              className="h-[42px] rounded-xl border px-4 text-sm font-semibold text-muted-foreground"
            >
              Schließen
            </button>
            <button
              type="button"
              disabled={reading || !source.trim()}
              onClick={() => read().catch(console.error)}
              className={cn("h-[42px] flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground", primaryOff)}
            >
              <span className="flex items-center justify-center gap-1.5">
                <AiMark />
                {reading ? "Lese Rezept …" : "Übernehmen"}
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="mb-2.5 grid grid-cols-[auto_1fr] items-start gap-3.5">
        <PhotoPicker src={photoSrc} category="dishes" onPick={pickPhoto} />
        <div className="grid min-w-0 gap-1">
          <label htmlFor="recipe-name" className={label}>
            Name
          </label>
          <input
            id="recipe-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="z. B. Skyrbrötchen"
            className={field}
          />
        </div>
      </div>

      <p className={kicker}>Zutaten, roh gewogen</p>
      <ul aria-label="Zutaten">
        {rows.map((row) => {
          const kcal = previewMacros(row.food.per_100, row.grams, row.food.basis, row.density).kcal;
          return (
            <li key={row.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 border-b border-dashed py-2">
              <span className="min-w-0 leading-snug font-semibold [overflow-wrap:anywhere]">
                {breakable(row.food.name)}
                <small className="block text-xs font-medium text-muted-foreground tabular-nums">
                  <span>{fmt(kcal)} kcal</span>
                  {" · "}
                  <button
                    type="button"
                    aria-label={`${row.food.name} tauschen`}
                    onClick={() => setSearching(row.key)}
                    className="relative font-bold text-primary after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                  >
                    tauschen
                  </button>
                </small>
              </span>
              <IngredientGrams
                name={row.food.name}
                grams={row.grams}
                max={MAX_ITEM_GRAMS}
                onChange={(grams) => change(row.key, { grams })}
              />
              <button
                type="button"
                aria-label={`${row.food.name} entfernen`}
                onClick={() => remove(row.key)}
                className={cn("size-[30px] text-muted-foreground", hitArea)}
              >
                ✕
              </button>
            </li>
          );
        })}
        {open.map((item) => (
          <li key={item.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 border-b border-dashed py-2">
            <span className="min-w-0 leading-snug font-semibold [overflow-wrap:anywhere]">
              {breakable(item.name)}
              <small className="block text-xs font-medium text-muted-foreground">
                <span className="font-bold text-destructive">nicht zugeordnet</span>
                {" · "}
                <button
                  type="button"
                  aria-label={`${item.name} suchen`}
                  onClick={() => setSearching({ open: item.key })}
                  className="relative font-bold text-primary after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
                >
                  suchen
                </button>
              </small>
            </span>
            <span className="font-bold tabular-nums">
              {fmt(item.grams)} <small className="text-xs font-semibold text-muted-foreground">g</small>
            </span>
            <button
              type="button"
              aria-label={`${item.name} entfernen`}
              onClick={() => setOpen((current) => current.filter((o) => o.key !== item.key))}
              className={cn("size-[30px] text-muted-foreground", hitArea)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {rows.length === 0 && open.length === 0 && (
        <p className="py-2 text-[13px] text-muted-foreground">Noch keine Zutat.</p>
      )}
      {open.length > 0 && (
        <p role="status" className="pt-2 text-[12.5px] font-semibold text-destructive">
          Nicht zugeordnete Zutaten zählen nicht mit.
        </p>
      )}
      {notes && <p className="pt-2 text-[12.5px] text-muted-foreground">{notes}</p>}

      <IngredientSearchField onClick={() => setSearching("new")} />

      {/* Narrow (zoom), −/+ need the whole width: the cooked weight goes below. */}
      <div className="mb-1 grid grid-cols-2 gap-3 max-[340px]:grid-cols-1">
        <div className="grid gap-1">
          <span id="recipe-portions" className={label}>
            Portionen
          </span>
          <div role="group" aria-labelledby="recipe-portions" className="flex items-center gap-2">
            <button
              type="button"
              aria-label="weniger Portionen"
              onClick={() => setPortions(Math.max(1, portions - 1))}
              className="size-[42px] rounded-[10px] border bg-surface-2 text-lg font-bold"
            >
              −
            </button>
            <output aria-label="Portionen" className="min-w-8 text-center text-lg font-bold tabular-nums">
              {portions}
            </output>
            <button
              type="button"
              aria-label="mehr Portionen"
              onClick={() => setPortions(Math.min(MAX_PORTIONS, portions + 1))}
              className="size-[42px] rounded-[10px] border bg-surface-2 text-lg font-bold"
            >
              +
            </button>
          </div>
        </div>
        <div className="grid min-w-0 gap-1">
          <label htmlFor="recipe-cooked" className={label}>
            Fertiggewicht in g
          </label>
          <input
            id="recipe-cooked"
            inputMode="decimal"
            value={cooked}
            onChange={(event) => setCooked(event.target.value)}
            placeholder={raw > 0 ? `${fmt(raw)} (wie Zutaten)` : "optional"}
            className={field}
          />
        </div>
      </div>
      {cookedWrong ? (
        <p role="alert" className="mb-3 text-[12.5px] font-semibold text-destructive">
          Fertiggewicht in Gramm, über 0 bis 50.000.
        </p>
      ) : (
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          Nach dem Backen oder Braten wiegen und hier eintragen. Leer gilt das Gewicht der Zutaten, etwa bei Suppe.
        </p>
      )}

      <div className="mb-3 grid gap-1">
        <label htmlFor="recipe-description" className={label}>
          Zubereitung
        </label>
        <textarea
          id="recipe-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          placeholder="z. B. verrühren, 20 Minuten bei 200 °C Umluft"
          className={`${field} h-auto min-h-[60px] py-2 [field-sizing:content]`}
        />
      </div>

      <p className={cn(kicker, "mb-1.5 tabular-nums")}>
        {`1 Portion${rows.length ? ` · ${fmt(finished / portions)} g` : ""}`}
      </p>
      <div data-testid="preview" className="mb-[18px] grid grid-cols-4 rounded-[14px] border tabular-nums">
        <div className="px-1.5 py-2.5 text-center">
          <b className="block text-[17px]">{fmt(perPortion.kcal)}</b>
          <span className="text-[11.5px] font-semibold text-muted-foreground">kcal</span>
        </div>
        {DOTS.map(({ key, label: text, color }) => (
          <div key={key} className="border-l px-1.5 py-2.5 text-center">
            <b className="block text-[17px]">{fmt(perPortion[key])}</b>
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              <i className="mr-1 inline-block size-[7px] rounded-full align-[1px]" style={{ background: color }} />
              {text}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-2.5 text-[13px] font-semibold text-destructive">
          {error}
          {conflict && (
            <button
              type="button"
              disabled={busy}
              onClick={() => save(true).catch(console.error)}
              className="ml-1.5 font-bold text-primary"
            >
              Trotzdem speichern
            </button>
          )}
        </p>
      )}
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => {
            writeDraft(key, null);
            onCancel();
          }}
          className="h-[54px] rounded-2xl border px-[18px] font-semibold text-muted-foreground"
        >
          {/* A new recipe is thrown away with its draft; an edit only goes back. */}
          {recipe ? "Abbrechen" : "Verwerfen"}
        </button>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => save().catch(console.error)}
          className={cn("h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground", primaryOff)}
        >
          Speichern
        </button>
      </div>
    </>
  );
}

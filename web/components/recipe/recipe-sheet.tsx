"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  createRecipe,
  getRecipe,
  imageUrl,
  updateRecipe,
  uploadFoodImage,
  type Basis,
  type FoodSummary,
  type Macros,
  type Recipe,
  type SearchHit,
} from "@/lib/api";
import { previewMacros } from "@/lib/amount";
import { fmt, shortName } from "@/lib/format";
import { DOTS } from "@/components/amount-sheet";
import { FoodPic } from "@/components/food-pic";
import { clampGrams, IngredientGrams } from "@/components/ingredient-grams";
import { SearchSheet } from "@/components/search-sheet";
import { SheetTitle } from "@/components/sheet";

/** An ingredient of a whole pot (the API's limit). */
const MAX_ITEM_GRAMS = 10_000;
const MAX_PORTIONS = 100;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // the API's limit, checked early for a clear message

type Row = {
  key: number;
  food: { id: number; name: string; basis: Basis; per_100: Macros };
  density: number;
  grams: number;
};

let rowKeys = 0;

const rowOf = (food: FoodSummary | SearchHit, grams: number): Row => ({
  key: rowKeys++,
  food: { id: food.id!, name: food.name, basis: food.basis, per_100: food.per_100 },
  density: food.density,
  grams,
});

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
  recent,
  onSaved,
  onCancel,
}: {
  recipeId?: number;
  recent: FoodSummary[];
  onSaved: (recipe: Recipe) => void;
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
  return <RecipeForm recipe={loaded ?? undefined} recent={recent} onSaved={onSaved} onCancel={onCancel} />;
}

function RecipeForm({
  recipe,
  recent,
  onSaved,
  onCancel,
}: {
  recipe?: Recipe;
  recent: FoodSummary[];
  onSaved: (recipe: Recipe) => void;
  onCancel: () => void;
}) {
  // The last saved state: after a save whose photo upload failed, a retry must update.
  const [base, setBase] = useState(recipe);
  const [name, setName] = useState(recipe?.name ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [rows, setRows] = useState<Row[]>(() => recipe?.items.map((item) => rowOf(item.food, item.grams)) ?? []);
  const [portions, setPortions] = useState(recipe?.portions ?? 1);
  // Empty: not weighed.
  const [cooked, setCooked] = useState(recipe?.cooked_grams ? String(recipe.cooked_grams) : "");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [searching, setSearching] = useState<number | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = photo?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  const change = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key: number) => setRows((current) => current.filter((row) => row.key !== key));
  const add = (food: FoodSummary | SearchHit) =>
    setRows((current) => [...current, rowOf(food, food.standard_serving.grams)]);

  const pickFood = (hit: SearchHit) => {
    if (hit.id === null || searching === null) return;
    if (searching === "new") add(hit);
    else change(searching, { food: rowOf(hit, 0).food, density: hit.density });
    setSearching(null);
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
  const cookedGrams = Number(cooked.replace(",", ".")) || 0;
  const finished = cookedGrams > 0 ? cookedGrams : raw;
  const total = sum(rows);
  const perPortion = {
    kcal: total.kcal / portions,
    protein: total.protein / portions,
    carbs: total.carbs / portions,
    fat: total.fat / portions,
  };
  const ready = name.trim() !== "" && rows.length > 0;
  // The recipe's own food is no ingredient of it.
  const suggestions = recent.filter(
    (food) => food.id !== base?.food_id && !rows.some((row) => row.food.id === food.id),
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      description: description.trim(),
      items: rows.map((row) => ({ food_id: row.food.id, grams: clampGrams(row.grams, MAX_ITEM_GRAMS) })),
      portions,
      cooked_grams: cookedGrams > 0 ? cookedGrams : null,
    };
    let saved: Recipe;
    try {
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
    onSaved(saved);
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
        <SearchSheet foodsOnly onPick={pickFood} />
      </>
    );
  }

  const photoSrc = photo?.url ?? (base?.image_path ? imageUrl(base.image_path) : null);

  return (
    <>
      <SheetTitle className="mb-2 text-[11px] font-bold tracking-[.12em] text-muted-foreground uppercase">
        {recipe ? "Rezept bearbeiten" : "Neues Rezept"}
      </SheetTitle>

      <div className="mb-2.5 grid grid-cols-[auto_1fr] items-start gap-3.5">
        <div className="grid justify-items-center gap-1.5">
          <button
            type="button"
            aria-label="Foto aufnehmen oder wählen"
            onClick={() => gallery.current?.click()}
            className="relative"
          >
            <FoodPic size={80} src={photoSrc} category="dishes" />
          </button>
          <div className="flex gap-2.5 text-[11.5px] font-bold text-muted-foreground">
            <button type="button" onClick={() => camera.current?.click()}>
              Kamera
            </button>
            <button type="button" onClick={() => gallery.current?.click()}>
              Galerie
            </button>
          </div>
          <input ref={gallery} type="file" accept="image/*" hidden data-testid="photo-gallery" onChange={pickPhoto} />
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden data-testid="photo-camera" onChange={pickPhoto} />
        </div>
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

      <p className={label}>Zutaten, roh gewogen</p>
      <ul aria-label="Zutaten">
        {rows.map((row) => {
          const kcal = previewMacros(row.food.per_100, row.grams, row.food.basis, row.density).kcal;
          return (
            <li key={row.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 border-b border-dashed py-2">
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
                max={MAX_ITEM_GRAMS}
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

      <div role="group" aria-label="Vorschläge" className="mt-3 mb-4 flex flex-wrap gap-2">
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

      <div className="mb-1 grid grid-cols-2 gap-3">
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
      <p className="mb-3 text-[12.5px] text-muted-foreground">
        Nach dem Backen oder Braten wiegen und hier eintragen. Leer gilt das Gewicht der Zutaten, etwa bei Suppe.
      </p>

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
          className={`${field} h-auto py-2`}
        />
      </div>

      <p className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground tabular-nums">
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
        </p>
      )}
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
          onClick={() => save().catch(console.error)}
          className="h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          Speichern
        </button>
      </div>
    </>
  );
}

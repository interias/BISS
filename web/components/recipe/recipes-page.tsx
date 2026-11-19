"use client";

import { useEffect, useState } from "react";
import { getRecipes, imageUrl, type Recipe } from "@/lib/api";
import { fmt } from "@/lib/format";
import { iconPill } from "@/lib/styles";
import { AiMark } from "@/components/ai-mark";
import { BookIcon, LinkIcon } from "@/components/icons";
import { MacroLine } from "@/components/macro-line";
import { FoodPic } from "@/components/food-pic";
import { draftName } from "@/components/recipe/recipe-sheet";
import { RowsSkeleton, useDelayed } from "@/components/skeleton";

/**
 * "Meine Rezepte" (ADR-0012), the page of the tab Rezepte (ADR-0015): all own recipes, the one
 * saved last first. A tap opens the amount sheet of the recipe's food to log portions, where
 * "Bearbeiten" leads to the recipe. Two buttons like the one for a new Schnellzugriff in the
 * dock, each with one word, since a symbol alone is guessed at: "+ Neu" (plus and book) starts
 * one, "Import" (sparkles and link) one read from a pasted recipe or link (ADR-0014). The header already says Rezepte, so no heading of its own. A new `stamp` loads the list and the draft again, after a
 * sheet over the page closed.
 */
/** The word beside the symbols, in the size of the other pills. */
const LABEL = "text-[13px] font-semibold";

export function RecipesPage({
  stamp,
  onPick,
  onNew,
  onImport,
  onError,
}: {
  stamp: number;
  onPick: (recipe: Recipe) => void;
  onNew: () => void;
  onImport: () => void;
  onError: (failure: unknown) => void;
}) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  // An unsaved new recipe stays until saved or discarded, and is found here again.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getRecipes().then((found) => {
      if (!live) return;
      setRecipes(found);
      setDraft(draftName());
    }, (failure) => live && onError(failure));
    return () => {
      live = false;
    };
  }, [stamp, onError]);
  const loadingShown = useDelayed(recipes === null);

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-2">
        <button type="button" aria-label="Neues Rezept" onClick={onNew} className={iconPill}>
          +
          <BookIcon size={17} />
          <span className={LABEL}>Neu</span>
        </button>
        <button type="button" aria-label="Import aus Text oder Link" onClick={onImport} className={iconPill}>
          <AiMark />
          <LinkIcon size={17} />
          <span className={LABEL}>Import</span>
        </button>
      </div>
      {draft !== null && (
        <button
          type="button"
          onClick={onNew}
          className="mb-1 grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-dashed border-primary px-3.5 py-2.5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-xs font-bold text-muted-foreground">Nicht gespeichert</span>
            <span className="block truncate font-semibold text-primary">{draft.trim() || "Neues Rezept"}</span>
          </span>
          <span className="text-sm font-bold text-primary">Weiter</span>
        </button>
      )}
      {loadingShown && <RowsSkeleton rows={3} />}
      <ul aria-label="Rezepte">
        {recipes?.map((recipe) => (
          <li key={recipe.id}>
            <button
              type="button"
              onClick={() => onPick(recipe)}
              className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-px border-b border-dashed py-[9px] text-left"
            >
              <span className="row-span-2">
                <FoodPic size={44} src={recipe.image_path && imageUrl(recipe.image_path)} category="dishes" />
              </span>
              <span className="min-w-0 self-end truncate font-semibold text-primary">{recipe.name}</span>
              <span className="self-end text-right font-bold tabular-nums">{fmt(recipe.per_portion.kcal)}</span>
              <span className="min-w-0 self-start truncate text-[12.5px] text-muted-foreground tabular-nums">
                {`${recipe.portions} ${recipe.portions === 1 ? "Portion" : "Portionen"} · je ${fmt(recipe.portion_grams)} g`}
                {draftName(recipe.id) !== null && " · Entwurf offen"}
              </span>
              {/* Like the kcal above: of one portion. */}
              <MacroLine macros={recipe.per_portion} className="self-start" />
            </button>
          </li>
        ))}
      </ul>
      {recipes?.length === 0 && (
        <p className="py-2 text-[13px] text-muted-foreground">
          Noch kein Rezept. Lege eins an: Zutaten, Portionen und nach dem Backen das Fertiggewicht.
        </p>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { getRecipes, imageUrl, type Recipe } from "@/lib/api";
import { fmt } from "@/lib/format";
import { FoodPic } from "@/components/food-pic";
import { SheetTitle } from "@/components/sheet";

/**
 * "Meine Rezepte" (ADR-0012): all own recipes, the one saved last first. A tap opens the
 * amount sheet of the recipe's food to log portions, where "Bearbeiten" leads to the recipe;
 * "+ Neues Rezept" starts one.
 */
export function RecipesSheet({ onPick, onNew }: { onPick: (recipe: Recipe) => void; onNew: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  useEffect(() => {
    let live = true;
    getRecipes().then((found) => live && setRecipes(found), console.error);
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <SheetTitle className="font-heading text-xl font-bold">Meine Rezepte</SheetTitle>
        <button
          type="button"
          onClick={onNew}
          className="h-9 flex-none rounded-full border border-dashed border-primary px-3 text-[13px] font-semibold text-primary"
        >
          + Neues Rezept
        </button>
      </div>
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
              <span className="col-[2/-1] min-w-0 self-start text-[12.5px] text-muted-foreground tabular-nums">
                {`${recipe.portions} ${recipe.portions === 1 ? "Portion" : "Portionen"} · je ${fmt(recipe.portion_grams)} g · kcal je Portion`}
              </span>
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

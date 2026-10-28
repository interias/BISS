import { expect, test } from "vitest";
import { biscuitLabel } from "@/test/fixtures";
import {
  isInvalid,
  parseInput,
  per100OfLabel,
  readNutrients,
  servingsOfLabel,
  shownOrigin,
  skippedNote,
  toInput,
} from "./editor";

const blank = { kcal: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "", sat_fat: "", salt: "" };

test("numbers go through the decimal comma both ways", () => {
  expect(toInput(1.5)).toBe("1,5");
  expect(toInput(null)).toBe("");
  expect(parseInput("1,5")).toBe(1.5);
  expect(parseInput("  ")).toBeNull();
  expect(parseInput("abc")).toBeNaN();
});

test("blank required values count as 0, blank optional ones as unset", () => {
  expect(readNutrients({ ...blank, kcal: "93", fat: "0,2" })).toEqual({
    kcal: 93,
    protein: 0,
    carbs: 0,
    fat: 0.2,
    fiber: null,
    sugar: null,
    sat_fat: null,
    salt: null,
  });
});

test("text that is no number or negative makes the table invalid", () => {
  expect(readNutrients({ ...blank, kcal: "abc" })).toBeNull();
  expect(readNutrients({ ...blank, salt: "-1" })).toBeNull();
  expect(isInvalid("-1")).toBe(true);
  expect(isInvalid("")).toBe(false);
});

test("a changed package or estimated serving shows own, an unchanged one keeps its origin", () => {
  const estimated = { label: "1 Banane", grams: 120, origin: "estimated" as const };
  expect(shownOrigin(estimated, "1 Banane", 120)).toBe("estimated");
  expect(shownOrigin(estimated, "1 Banane", 130)).toBe("own");
  expect(shownOrigin(estimated, "Banane", 120)).toBe("own");
  expect(shownOrigin({ ...estimated, origin: "package" }, "1 Banane", 99)).toBe("own");
  expect(shownOrigin({ ...estimated, origin: "own" }, "x", 1)).toBe("own");
  expect(shownOrigin(undefined, "", null)).toBe("own");
});

test("a label draft maps to the food's names and keeps its servings in the basis with their origin", () => {
  const { draft } = biscuitLabel(null);
  expect(per100OfLabel(draft.per_100)).toEqual({
    kcal: 460,
    protein: 8,
    carbs: 64,
    fat: 18,
    fiber: 5,
    sugar: 22,
    sat_fat: 7.5,
    salt: 0.6,
  });
  const drink = {
    ...draft,
    per_100: { ...draft.per_100, basis: "ml" as const },
    servings: [
      { label: "1 Glas", amount: 250, unit: "ml" as const, source: "package" as const },
      { label: "1 Portion Pulver", amount: 25, unit: "g" as const, source: "package" as const },
      { label: "1 Schluck", amount: 20, unit: "ml" as const, source: "estimated" as const },
    ],
  };
  expect(servingsOfLabel(drink)).toEqual({
    servings: [
      { label: "1 Glas", grams: 250, origin: "package" },
      { label: "1 Schluck", grams: 20, origin: "estimated" },
    ],
    skipped: ["g bei Basis ml"],
  });
  const biscuit = {
    ...draft,
    servings: [
      { label: " 1 Keks ", amount: 12.5, unit: "g" as const, source: "package" as const },
      { label: "1 Glas Milch dazu", amount: 200, unit: "ml" as const, source: "estimated" as const },
      { label: "1 Teller", amount: 125, unit: "ml" as const, source: "package" as const },
      { label: "1 Krümel", amount: 0, unit: "g" as const, source: "estimated" as const },
    ],
  };
  const { servings, skipped } = servingsOfLabel(biscuit);
  expect(servings).toEqual([{ label: "1 Keks", grams: 12.5, origin: "package" }]);
  expect(skippedNote(skipped)).toBe("3 Portionen aus dem Etikett nicht übernommen (ml bei Basis g, ohne Menge).");
  expect(skippedNote(["ml bei Basis g"])).toBe("1 Portion aus dem Etikett nicht übernommen (ml bei Basis g).");
  expect(skippedNote([])).toBeNull();
});

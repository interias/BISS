import { expect, test } from "vitest";
import { isInvalid, parseInput, readNutrients, shownOrigin, toInput } from "./editor";

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

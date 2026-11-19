import { expect, test } from "vitest";
import { carbsRemainder, goalShares, proteinFatKcal, wholeNumber } from "./goals";

test("the carbs are the remainder of the kcal", () => {
  expect(carbsRemainder({ kcal: 2400, protein: 160, fat: 75 })).toBe(271.25);
  // More protein: the carbs go down by the same kcal.
  expect(carbsRemainder({ kcal: 2400, protein: 180, fat: 75 })).toBe(251.25);
  expect(carbsRemainder({ kcal: 1000, protein: 150, fat: 60 })).toBeLessThan(0);
  expect(proteinFatKcal({ kcal: 1000, protein: 150, fat: 60 })).toBe(1140);
});

test("the shares of the kcal add up to 100 %", () => {
  const { labels, widths } = goalShares({ kcal: 2400, protein: 160, fat: 75 });
  expect(labels).toEqual({ protein: 27, carbs: 45, fat: 28 });
  expect(widths.protein + widths.carbs + widths.fat).toBeCloseTo(1);
  // Too much protein and fat: no carbs, the bar shows those two.
  expect(goalShares({ kcal: 1000, protein: 150, fat: 60 }).labels.carbs).toBe(0);
});

test("a goal field takes whole numbers above 0", () => {
  expect(wholeNumber("2.400")).toBe(2400);
  expect(wholeNumber(" 160 ")).toBe(160);
  expect(wholeNumber("0")).toBeNull();
  expect(wholeNumber("")).toBeNull();
});

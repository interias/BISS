import { describe, expect, test } from "vitest";
import { previewMacros, stepDown, stepUp } from "./amount";

describe("gram steps: 5 g up to 100 g, 10 g above", () => {
  test.each([
    [5, 10],
    [95, 100],
    [100, 110],
    [110, 120],
    [58, 63],
  ])("+ from %i g gives %i g", (from, to) => expect(stepUp(from)).toBe(to));

  test.each([
    [120, 110],
    [110, 100],
    [100, 95],
    [95, 90],
    [10, 5],
    [5, 5],
    [7, 5],
  ])("− from %i g gives %i g", (from, to) => expect(stepDown(from)).toBe(to));

  test("− and + are inverse around 100 g", () => {
    expect(stepDown(stepUp(100))).toBe(100);
    expect(stepUp(stepDown(100))).toBe(100);
  });
});

describe("local preview: value per 100 × grams / 100", () => {
  const per100 = { kcal: 93, protein: 1.1, carbs: 20, fat: 0.2 };

  test("scales the values per 100 g, rounded to 0.1 like the snapshot", () => {
    const m = previewMacros(per100, 120, "g");
    expect(m.kcal).toBe(111.6);
    expect(m.protein).toBe(1.3);
    expect(m.carbs).toBe(24);
    expect(m.fat).toBe(0.2);
  });

  test("rounds 0.48 g up to 0.5 g like the snapshot, not down to 0", () => {
    // 120 g banana with 0.4 g fat per 100 g: the diary shows F 1, so must the preview.
    expect(previewMacros({ ...per100, fat: 0.4 }, 120, "g").fat).toBe(0.5);
  });

  test("ignores the density for basis g", () => {
    expect(previewMacros(per100, 200, "g", 1.5).kcal).toBeCloseTo(186);
  });

  test("converts grams to ml through the density for basis ml", () => {
    // 206 g of milk with density 1.03 are 200 ml.
    const milk = { kcal: 64, protein: 3.3, carbs: 4.8, fat: 3.5 };
    const m = previewMacros(milk, 206, "ml", 1.03);
    expect(m.kcal).toBeCloseTo(128);
    expect(m.fat).toBeCloseTo(7);
  });
});

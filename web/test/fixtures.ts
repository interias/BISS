import { vi } from "vitest";
import type { Day, Entry, FoodDetail, FoodSummary, Macros } from "@/lib/api";

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const banana: FoodSummary = {
  id: 7,
  name: "Banane roh",
  brand: null,
  source: "bls",
  basis: "g",
  per_100: { kcal: 93, protein: 1.1, carbs: 20, fat: 0.2 },
  standard_serving: { label: "1 Banane", grams: 120, origin: "estimated" },
};

export const bananaDetail: FoodDetail = {
  ...banana,
  gtin: null,
  source_id: "F503100",
  density: 1,
  image_path: null,
  per_100: { ...banana.per_100, fiber: 2, sugar: 17, sat_fat: 0.1, salt: 0 },
  servings: [{ id: 1, label: "1 Banane", grams: 120, origin: "estimated", is_default: true }],
};

export const bananaEntry: Entry = {
  id: 42,
  food: { id: 7, name: "Banane roh", brand: null, source: "bls" },
  grams: 120,
  meal: "snack",
  eaten_at: "2026-10-28T10:05:00+01:00",
  day: "2026-10-28",
  macros: { kcal: 111.6, protein: 1.3, carbs: 24, fat: 0.2 },
};

export function makeDay(entries: Entry[] = []): Day {
  const sum = (list: Entry[]) =>
    list.reduce(
      (a, e) => ({
        kcal: a.kcal + e.macros.kcal,
        protein: a.protein + e.macros.protein,
        carbs: a.carbs + e.macros.carbs,
        fat: a.fat + e.macros.fat,
      }),
      ZERO,
    );
  return {
    date: "2026-10-28",
    totals: sum(entries),
    targets: { kcal: 2400, protein: 160, carbs: 260, fat: 75 },
    meals: (["breakfast", "lunch", "snack", "dinner"] as const).map((meal) => {
      const own = entries.filter((e) => e.meal === meal);
      return { meal, totals: sum(own), entries: own };
    }),
    suggested_meal: "snack",
  };
}

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** A fake backend for /api/v1: GET /days/today and /recent, POST and DELETE /entries. */
export function fakeApi() {
  let entries: Entry[] = [];
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (url === "/api/v1/days/today") return json(makeDay(entries));
    if (url === "/api/v1/recent") return json([banana]);
    if (url === "/api/v1/entries" && method === "POST") {
      const entry = { ...bananaEntry, id: 100 + calls.length };
      entries = [...entries, entry];
      return json(entry, 201);
    }
    const match = url.match(/^\/api\/v1\/entries\/(\d+)$/);
    if (match && method === "DELETE") {
      entries = entries.filter((e) => e.id !== Number(match[1]));
      return json(null, 204);
    }
    return json({ detail: "not faked" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

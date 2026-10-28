import { vi } from "vitest";
import type {
  BarcodeFood,
  Day,
  Entry,
  FoodDetail,
  FoodSummary,
  LabelExtraction,
  Macros,
  SearchHit,
} from "@/lib/api";

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

/** An invented product (prefix 2, internal numbers) as a draft from Open Food Facts. */
export const PUDDING_CODE = "2000000013015";
export const puddingDraft: BarcodeFood = {
  id: null,
  gtin: "0" + PUDDING_CODE,
  name: "Testpudding Schoko",
  brand: "Testmarke",
  source: "off",
  basis: "g",
  density: 1,
  image_path: null,
  per_100: { kcal: 74, protein: 10, carbs: 5.2, fat: 1.4, fiber: null, sugar: null, sat_fat: null, salt: null },
  servings: [{ label: "1 Becher (200 g)", grams: 200, origin: "package", is_default: true }],
  standard_serving: { label: "1 Becher (200 g)", grams: 200, origin: "package" },
};

/** The pudding as a search hit from the Open Food Facts cache: no food yet, only its GTIN. */
export const puddingHit: SearchHit = {
  id: null,
  gtin: puddingDraft.gtin,
  name: puddingDraft.name,
  brand: puddingDraft.brand,
  source: "off",
  basis: "g",
  per_100: { kcal: 74, protein: 10, carbs: 5.2, fat: 1.4 },
  standard_serving: puddingDraft.standard_serving,
};

/** The fake extractor's draft (api/app/labels/extractor.py, FAKE_DRAFT) for a scanned GTIN. */
export const biscuitLabel = (gtin: string | null): LabelExtraction => ({
  draft: {
    name: "Haferkeks Dinkel",
    brand: "Testmühle",
    package_size: { amount: 200, unit: "g" },
    per_100: {
      basis: "g",
      state: "as_sold",
      energy_kj: 1925,
      energy_kcal: 460,
      fat: 18,
      saturated_fat: 7.5,
      carbs: 64,
      sugar: 22,
      fiber: 5,
      protein: 8,
      salt: 0.6,
    },
    servings: [{ label: "1 Keks (12,5 g)", amount: 12.5, unit: "g", source: "package" }],
    confidence: 0.9,
    notes: "",
    gtin,
  },
  validation: { ok: true, atwater: { computed_kcal: 460, deviation_pct: 0, ok: true }, violations: [] },
  model: "claude-haiku-5-5",
  attempts: 1,
});

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

/**
 * A fake backend for /api/v1: GET /days/today and /recent, POST and DELETE /entries, the
 * banana for GET and PATCH /foods/7 and a search that finds only "banane" and the cached
 * pudding ("pudding"); POST /foods
 * creates food 55 with the given name; /foods/validate always finds the values plausible.
 * The barcode chain knows only the pudding draft, by any form of its code; any other code is
 * a miss. The label
 * extraction answers the fake extractor's draft with the GTIN sent.
 */
export function fakeApi() {
  let entries: Entry[] = [];
  const foods: Record<number, FoodDetail> = { 7: bananaDetail };
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ method, url, body });
    if (url === "/api/v1/days/today") return json(makeDay(entries));
    if (url === "/api/v1/recent") return json([banana]);
    if (url.startsWith("/api/v1/foods/search")) {
      return json(url.includes("banane") ? [banana] : url.includes("pudding") ? [puddingHit] : []);
    }
    const barcode = url.match(/^\/api\/v1\/foods\/barcode\/(\d+)$/);
    if (barcode && barcode[1].padStart(14, "0") === puddingDraft.gtin) return json(puddingDraft);
    const own = barcode && Object.values(foods).find((f) => f.gtin === barcode[1].padStart(14, "0"));
    if (own) return json(own);
    if (barcode) return json({ detail: "no product", gtin: barcode[1].padStart(14, "0") }, 404);
    if (url === "/api/v1/foods/validate") {
      return json({ atwater: { computed_kcal: 93.4, deviation_pct: 0.4, ok: true } });
    }
    if (url === "/api/v1/labels/extract" && method === "POST") {
      return json(biscuitLabel(String((body as FormData).get("gtin"))));
    }
    if (url === "/api/v1/foods" && method === "POST") {
      const gtin = body.gtin ? String(body.gtin).padStart(14, "0") : null;
      foods[55] = { ...bananaDetail, id: 55, name: body.name, brand: body.brand, gtin, source: "own" };
      return json(foods[55], 201);
    }
    const food = url.match(/^\/api\/v1\/foods\/(\d+)$/);
    if (food && method === "GET" && foods[Number(food[1])]) return json(foods[Number(food[1])]);
    if (food && method === "PATCH") {
      foods[7] = { ...foods[7], name: body.name };
      return json(foods[7]);
    }
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

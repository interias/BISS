import { vi } from "vitest";
import type {
  BarcodeFood,
  Combo,
  Day,
  Entry,
  FoodDetail,
  FoodSummary,
  LabelExtraction,
  Macros,
  PlateExtraction,
  PlateItem,
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
  group_id: null,
  group_name: null,
};

export const riceDetail: FoodSummary = {
  id: 8,
  name: "Reis gekocht",
  brand: null,
  source: "bls",
  basis: "g",
  per_100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  standard_serving: { label: "1 Portion", grams: 150, origin: "estimated" },
};

const chicken: FoodSummary = {
  id: 9,
  name: "Hähnchen Brustfilet, gegrillt",
  brand: null,
  source: "bls",
  basis: "g",
  per_100: { kcal: 150, protein: 30, carbs: 0, fat: 3 },
  standard_serving: { label: "1 Filet", grams: 120, origin: "estimated" },
};

const ref = (food: FoodSummary) => ({ id: food.id, name: food.name, brand: food.brand, source: food.source });
const scale = (per100: Macros, grams: number): Macros => ({
  kcal: Math.round(per100.kcal * grams) / 100,
  protein: Math.round(per100.protein * grams) / 100,
  carbs: Math.round(per100.carbs * grams) / 100,
  fat: Math.round(per100.fat * grams) / 100,
});

/**
 * The fake extractor's plate (api/app/plates/extractor.py) on the full BLS: chicken and rice
 * recognized, a vague third ingredient guessed. With `broccoliMatched` false it is not matched
 * (food_id null, no values), as on a database without that food.
 */
export const fakePlate = (broccoliMatched = true): PlateExtraction => {
  const item = (food: FoodSummary, grams: number, confidence: number): PlateItem => ({
    food_id: food.id,
    name: food.name,
    grams,
    confidence,
    certainty: confidence >= 0.7 ? "recognized" : "guessed",
    food: ref(food),
    basis: food.basis,
    density: 1,
    per_100: food.per_100,
    macros: scale(food.per_100, grams),
  });
  return {
    dish: "Hähnchen mit Reis und Brokkoli",
    items: [
      item(chicken, 120, 0.9),
      item(riceDetail, 150, 0.85),
      broccoliMatched
        ? item(broccoli, 80, 0.6)
        : {
            food_id: null,
            name: "Broccoli gekocht",
            grams: 80,
            confidence: 0.6,
            certainty: "guessed",
            food: null,
            basis: null,
            density: null,
            per_100: null,
            macros: null,
          },
    ],
    totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    notes: "",
    model: "claude-haiku-5-5",
    attempts: 1,
  };
};

export const broccoli: FoodSummary = {
  id: 10,
  name: "Broccoli gekocht",
  brand: null,
  source: "bls",
  basis: "g",
  per_100: { kcal: 30, protein: 3, carbs: 2.5, fat: 0.4 },
  standard_serving: { label: "1 Portion", grams: 100, origin: "estimated" },
};

export const sugar: FoodSummary = {
  id: 11,
  name: "Zucker",
  brand: null,
  source: "bls",
  basis: "g",
  per_100: { kcal: 400, protein: 0, carbs: 100, fat: 0 },
  standard_serving: { label: "1 TL", grams: 5, origin: "estimated" },
};

export const coffee: FoodSummary = {
  id: 12,
  name: "Kaffee, Filter",
  brand: null,
  source: "bls",
  basis: "ml",
  per_100: { kcal: 2, protein: 0.1, carbs: 0.3, fat: 0 },
  standard_serving: { label: "1 Tasse", grams: 200, origin: "estimated" },
};

const comboOf = (id: number, name: string, items: { food: FoodSummary; grams: number }[]): Combo => {
  const full = items.map(({ food, grams }) => ({ food, grams, density: 1, macros: scale(food.per_100, grams) }));
  return { id, name, items: full, totals: sum(full.map((item) => item.macros)) };
};

/** The Schnellzugriff "Kaffee": 200 ml coffee and 5 g sugar, 24 kcal. */
export const coffeeCombo = (): Combo =>
  comboOf(1, "Kaffee", [
    { food: coffee, grams: 200 },
    { food: sugar, grams: 5 },
  ]);

const sum = (list: Macros[]) =>
  list.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }),
    ZERO,
  );

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
      // The backend lists the plates of the meal by their first entry.
      const groups = [...new Set(own.flatMap((e) => (e.group_id ? [e.group_id] : [])))].map((id) => {
        const members = own.filter((e) => e.group_id === id);
        return { group_id: id, group_name: members[0].group_name!, totals: sum(members), entry_ids: members.map((e) => e.id) };
      });
      return { meal, totals: sum(own), entries: own, groups };
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
 * extraction answers the fake extractor's draft with the GTIN sent. The plate extraction
 * answers `fakePlate()`; POST /entries/group logs one entry per item in the meal "snack"
 * (kcal from per 100 g) and DELETE /entries/group/{id} removes them. /combos keeps the given
 * combos: POST from items or a group_id, PATCH, DELETE and POST /combos/{id}/log, which logs
 * a group named like the combo with its items or the ones sent.
 */
export function fakeApi({ plate = fakePlate(), combos = [] }: { plate?: PlateExtraction; combos?: Combo[] } = {}) {
  let entries: Entry[] = [];
  let nextId = 200;
  let saved = [...combos];
  let nextCombo = 50;
  const catalog = [banana, riceDetail, chicken, broccoli, sugar, coffee];
  type Item = { food_id: number; grams: number };
  const byId = (id: number) => catalog.find((f) => f.id === id)!;
  const template = (id: number, name: string, items: Item[]) =>
    comboOf(id, name, items.map((item) => ({ food: byId(item.food_id), grams: item.grams })));
  const logGroup = (group_name: string, items: Item[], meal?: Entry["meal"], eaten_at?: string) => {
    const group_id = `group-${nextId}`;
    const created = items.map((item) => {
      const food = byId(item.food_id);
      return {
        ...bananaEntry,
        id: nextId++,
        food: ref(food),
        grams: item.grams,
        meal: meal ?? "snack",
        eaten_at: eaten_at ?? bananaEntry.eaten_at,
        macros: scale(food.per_100, item.grams),
        group_id,
        group_name,
      };
    });
    entries = [...entries, ...created];
    const totals = sum(created.map((e) => e.macros));
    return json({ group_id, group_name, meal: created[0].meal, day: "2026-10-28", totals, entries: created }, 201);
  };
  const detail = (food: FoodSummary): FoodDetail => ({
    ...bananaDetail,
    ...food,
    per_100: { ...food.per_100, fiber: null, sugar: null, sat_fat: null, salt: null },
    servings: [{ id: food.id, ...food.standard_serving, origin: "estimated", is_default: true }],
  });
  const foods: Record<number, FoodDetail> = {
    7: bananaDetail,
    8: detail(riceDetail),
    9: detail(chicken),
    10: detail(broccoli),
  };
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ method, url, body });
    if (url === "/api/v1/days/today") return json(makeDay(entries));
    if (url === "/api/v1/recent") return json([banana, riceDetail]);
    if (url.startsWith("/api/v1/foods/search")) {
      return json(
        url.includes("banane")
          ? [banana]
          : url.includes("pudding")
            ? [puddingHit]
            : url.includes("brok")
              ? [broccoli, puddingHit]
              : [],
      );
    }
    if (url === "/api/v1/plates/extract" && method === "POST") return json(plate);
    if (url === "/api/v1/entries/group" && method === "POST") {
      return logGroup(body.group_name, body.items, body.meal, body.eaten_at);
    }
    if (url === "/api/v1/combos" && method === "GET") return json(saved);
    if (url === "/api/v1/combos" && method === "POST") {
      const group: Entry[] | undefined = body.group_id && entries.filter((e) => e.group_id === body.group_id);
      const combo = group
        ? template(nextCombo++, body.name ?? group[0].group_name, group.map((e) => ({ food_id: e.food.id, grams: e.grams })))
        : template(nextCombo++, body.name, body.items);
      saved = [...saved, combo];
      return json(combo, 201);
    }
    const combo = url.match(/^\/api\/v1\/combos\/(\d+)(\/log)?$/);
    const known = combo && saved.find((c) => c.id === Number(combo[1]));
    if (known && combo[2] && method === "POST") {
      const items = body.items ?? known.items.map((i) => ({ food_id: i.food.id, grams: i.grams }));
      return logGroup(known.name, items, body.meal);
    }
    if (known && method === "PATCH") {
      const items = body.items ?? known.items.map((i) => ({ food_id: i.food.id, grams: i.grams }));
      const changed = template(known.id, body.name ?? known.name, items);
      saved = saved.map((c) => (c.id === known.id ? changed : c));
      return json(changed);
    }
    if (known && method === "DELETE") {
      saved = saved.filter((c) => c.id !== known.id);
      return json(null, 204);
    }
    const groupPrefix = "/api/v1/entries/group/";
    if (url.startsWith(groupPrefix) && method === "DELETE") {
      entries = entries.filter((e) => e.group_id !== url.slice(groupPrefix.length));
      return json(null, 204);
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
      const gtin = (body as FormData).get("gtin"); // absent after the shutter "Etikett"
      return json(biscuitLabel(gtin === null ? null : String(gtin)));
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

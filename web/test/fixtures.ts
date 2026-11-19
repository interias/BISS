import { vi } from "vitest";
import type {
  BarcodeFood,
  Combo,
  Day,
  DayRow,
  Entry,
  FoodDetail,
  FoodSummary,
  LabelExtraction,
  Macros,
  PlateExtraction,
  PlateItem,
  Recipe,
  SearchHit,
  Stats,
} from "@/lib/api";

const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const banana: FoodSummary = {
  id: 7,
  name: "Banane roh",
  brand: null,
  source: "bls",
  basis: "g",
  density: 1,
  category: "fruit",
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
  category: "other",
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
  density: 1,
  category: null,
  per_100: { kcal: 74, protein: 10, carbs: 5.2, fat: 1.4 },
  standard_serving: puddingDraft.standard_serving,
};

/** An invented product only the Open Food Facts text search knows (ADR-0011). */
export const muesliDraft: BarcodeFood = {
  ...puddingDraft,
  gtin: "02000000014012",
  name: "Zippelmo Beerenmüsli",
  brand: "Testmühle",
  category: "grains",
  per_100: { kcal: 372, protein: 9.5, carbs: 61, fat: 7.8, fiber: null, sugar: 18, sat_fat: null, salt: null },
  servings: [{ label: "1 Schale (50 g)", grams: 50, origin: "package", is_default: true }],
  standard_serving: { label: "1 Schale (50 g)", grams: 50, origin: "package" },
};

export const muesliHit: SearchHit = {
  id: null,
  gtin: muesliDraft.gtin,
  name: muesliDraft.name,
  brand: muesliDraft.brand,
  source: "off",
  basis: "g",
  density: 1,
  category: "grains",
  per_100: { kcal: 372, protein: 9.5, carbs: 61, fat: 7.8 },
  standard_serving: muesliDraft.standard_serving,
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
      alcohol_vol: null,
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
  food: { id: 7, name: "Banane roh", brand: null, source: "bls", category: "fruit" },
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
  density: 1,
  category: null,
  per_100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  standard_serving: { label: "1 Portion", grams: 150, origin: "estimated" },
};

const chicken: FoodSummary = {
  id: 9,
  name: "Hähnchen Brustfilet, gegrillt",
  brand: null,
  source: "bls",
  basis: "g",
  density: 1,
  category: null,
  per_100: { kcal: 150, protein: 30, carbs: 0, fat: 3 },
  standard_serving: { label: "1 Filet", grams: 120, origin: "estimated" },
};

const ref = (food: FoodSummary) => ({
  id: food.id,
  name: food.name,
  brand: food.brand,
  source: food.source,
  category: food.category,
});
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
  density: 1,
  category: null,
  per_100: { kcal: 30, protein: 3, carbs: 2.5, fat: 0.4 },
  standard_serving: { label: "1 Portion", grams: 100, origin: "estimated" },
};

export const sugar: FoodSummary = {
  id: 11,
  name: "Zucker",
  brand: null,
  source: "bls",
  basis: "g",
  density: 1,
  category: null,
  per_100: { kcal: 400, protein: 0, carbs: 100, fat: 0 },
  standard_serving: { label: "1 TL", grams: 5, origin: "estimated" },
};

export const coffee: FoodSummary = {
  id: 12,
  name: "Kaffee, Filter",
  brand: null,
  source: "bls",
  basis: "ml",
  density: 1,
  category: null,
  per_100: { kcal: 2, protein: 0.1, carbs: 0.3, fat: 0 },
  standard_serving: { label: "1 Tasse", grams: 200, origin: "estimated" },
};

const comboOf = (id: number, name: string, items: { food: FoodSummary; grams: number }[]): Combo => {
  const full = items.map(({ food, grams }) => ({ food, grams, density: 1, macros: scale(food.per_100, grams) }));
  return { id, name, items: full, totals: sum(full.map((item) => item.macros)), last_used: null };
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

/** A baked recipe: 540 g of ingredients weigh 450 g out of the oven, in five portions. */
export const skyrRecipe: Recipe = {
  id: 70,
  food_id: 71,
  name: "Skyrbrötchen",
  description: "Verrühren, 20 Minuten bei 200 °C Umluft.",
  image_path: null,
  portions: 5,
  cooked_grams: 450,
  raw_grams: 540,
  portion_grams: 90,
  items: [
    { food: riceDetail, grams: 290, density: 1, macros: scale(riceDetail.per_100, 290) },
    { food: chicken, grams: 250, density: 1, macros: scale(chicken.per_100, 250) },
  ],
  per_portion: { kcal: 185.2, protein: 12, carbs: 26, fat: 2.8 },
  totals: { kcal: 926.1, protein: 60, carbs: 130, fat: 14 },
};

/** A Gericht already in the diary: the fake plate's ingredients as the group "group-200". */
export const dishGroup = (): Entry[] =>
  fakePlate().items.map((item, index) => ({
    ...bananaEntry,
    id: 200 + index,
    food: item.food!,
    grams: item.grams,
    macros: item.macros!,
    group_id: "group-200",
    group_name: fakePlate().dish,
  }));

/** The diary rows as the backend orders them: newest first, a group at its first entry. */
function dayRows(entries: Entry[], sum: (list: Entry[]) => Macros): DayRow[] {
  const byTime = [...entries].sort((a, b) => a.eaten_at.localeCompare(b.eaten_at) || a.id - b.id);
  return byTime
    .flatMap((entry): DayRow[] => {
      if (!entry.group_id) return [{ kind: "entry", entry }];
      const members = byTime.filter((e) => e.group_id === entry.group_id);
      if (members[0] !== entry) return [];
      return [
        {
          kind: "group",
          group_id: entry.group_id,
          group_name: entry.group_name!,
          meal: entry.meal,
          eaten_at: entry.eaten_at,
          totals: sum(members),
          entries: members,
        },
      ];
    })
    .reverse();
}

/** The fake's today; its entries are those of this day. */
export const FAKE_TODAY = "2026-10-28";

/** The statistics of last week as GET /stats answers them, for the fake backend. */
export function fakeStats(from: string, to: string): Stats {
  return {
    from,
    to,
    today: FAKE_TODAY,
    days_possible: 7,
    days_logged: 6,
    average: { kcal: 2276, protein: 150, carbs: 250, fat: 70 },
    target_average: { kcal: 2400, protein: 160, carbs: 260, fat: 75 },
    targets_vary: false,
    tolerance: 0.1,
    in_range: { kcal: 2, protein: 5, carbs: 4, fat: 3 },
    previous: { from, to, average_kcal: 2343 },
    trailing_kcal: [],
    weekdays: [2100, 2200, null, 2300, 2400, 2500, 2600],
    times_of_day: { morning: 500, midday: 800, afternoon: 300, evening: 676 },
    top: [{ name: "Banane roh", kind: "food", count: 5, kcal: 560 }],
    first_day: "2026-08-01",
  };
}

export function makeDay(entries: Entry[] = [], date = FAKE_TODAY): Day {
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
    date,
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
    rows: dayRows(entries, sum),
    suggested_meal: "snack",
  };
}

const addDay = (date: string) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * A fake backend for /api/v1: GET /days/today, /recent and /chips, POST and DELETE /entries, the
 * banana for GET and PATCH /foods/7 and a search that finds only "banane" and the cached
 * pudding ("pudding"), with off_more below 5 hits; the Open Food Facts search finds the
 * muesli ("zippelmo") and fails for "offline"; POST /foods
 * creates food 55 with the given name; /foods/validate always finds the values plausible.
 * The barcode chain knows only the pudding draft, by any form of its code; any other code is
 * a miss. The label
 * extraction answers the fake extractor's draft with the GTIN sent. The plate extraction
 * answers `fakePlate()`. POST /recipes answers `skyrRecipe` with the name and the sum of the
 * items sent, and its food 71 takes them as its one portion; PUT /foods/{id}/image gives that
 * food a photo; an entry of food 71 is one of that dish. The diary starts with `entries`.
 * POST /entries/group logs one entry per item in the meal "snack"
 * (kcal from per 100 g) and DELETE /entries/group/{id} removes them. /combos keeps the given
 * combos: POST from items or a group_id, PATCH, DELETE and POST /combos/{id}/log, which logs
 * a group named like the combo with its items or the ones sent.
 */
export function fakeApi({
  plate = fakePlate(),
  combos = [],
  entries: logged = [],
}: { plate?: PlateExtraction; combos?: Combo[]; entries?: Entry[] } = {}) {
  let entries: Entry[] = [...logged];
  let nextId = 200 + logged.length;
  // The standard goals, the newest first, and the tolerance of the statistics.
  let goal = { kcal: 2400, protein: 160, carbs: 260, fat: 75, valid_from: "2026-10-01" as string | null };
  let goals = [goal, { kcal: 2600, protein: 150, carbs: 290, fat: 85, valid_from: "2026-08-01" }];
  let tolerance = 0.1;
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
        day: eaten_at ? eaten_at.slice(0, 10) : bananaEntry.day,
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
    // The food of skyrRecipe: logged in portions, edited as a recipe.
    [skyrRecipe.food_id]: {
      ...bananaDetail,
      id: skyrRecipe.food_id,
      name: skyrRecipe.name,
      source: "own",
      category: "dishes",
      recipe_id: skyrRecipe.id,
      servings: [{ id: 9, label: "1 Portion", grams: 90, origin: "own", is_default: true }],
      standard_serving: { label: "1 Portion", grams: 90, origin: "own" },
    },
    8: detail(riceDetail),
    9: detail(chicken),
    10: detail(broccoli),
  };
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ method, url, body });
    const onDay = (date: string) => entries.filter((e) => e.day === date);
    if (url === "/api/v1/days/today") return json(makeDay(onDay(FAKE_TODAY)));
    const dayUrl = url.match(/^\/api\/v1\/days\/(\d{4}-\d{2}-\d{2})$/);
    if (dayUrl) return json(makeDay(onDay(dayUrl[1]), dayUrl[1]));
    const range = url.match(/^\/api\/v1\/days\?from=([\d-]+)&to=([\d-]+)$/);
    if (range) {
      const days = [];
      for (let date = range[1]; date <= range[2]; date = addDay(date)) {
        const day = makeDay(onDay(date), date);
        days.push({ date, totals: day.totals, targets: day.targets, entries: onDay(date).length });
      }
      return json({ days });
    }
    const stats = url.match(/^\/api\/v1\/stats\?from=([\d-]+)&to=([\d-]+)$/);
    if (stats) return json(fakeStats(stats[1], stats[2]));
    if (url === "/api/v1/goals/default" && method === "GET") return json({ ...goal, kind: "default" });
    if (url === "/api/v1/goals/default" && method === "PUT") {
      goal = { ...body, carbs: (body.kcal - 4 * body.protein - 9 * body.fat) / 4, valid_from: FAKE_TODAY };
      goals = [goal, ...goals.filter((g) => g.valid_from !== FAKE_TODAY)];
      return json({ ...goal, kind: "default" });
    }
    if (url === "/api/v1/goals") return json({ goals });
    if (url === "/api/v1/settings" && method === "GET") return json({ tolerance });
    if (url === "/api/v1/settings" && method === "PUT") {
      tolerance = body.tolerance;
      return json({ tolerance });
    }
    if (url === "/api/v1/recent") return json([banana, riceDetail]);
    // As the backend: the recent foods, then the combos never logged (all of the fake's).
    if (url === "/api/v1/chips") {
      const foods = [banana, riceDetail].map((food) => ({ food, combo: null }));
      return json([...foods, ...saved.map((combo) => ({ food: null, combo }))]);
    }
    if (url === "/api/v1/foods/suggestions") {
      const food = (summary: FoodSummary) => ({ food: { ...summary, gtin: null }, combo: null });
      return json({
        likely: [food(riceDetail)],
        recent: [...saved.map((combo) => ({ food: null, combo })), food(banana), food(riceDetail), food(chicken)],
      });
    }
    if (url.startsWith("/api/v1/foods/search/off")) {
      if (url.includes("offline")) return json({ hits: [], reason: "timeout" });
      return json({ hits: url.toLowerCase().includes("zippelmo") ? [muesliHit] : [], reason: null });
    }
    if (url.startsWith("/api/v1/foods/search")) {
      const hits = url.includes("banane")
        ? [banana]
        : url.includes("pudding")
          ? [puddingHit]
          : url.includes("brok")
            ? [broccoli, puddingHit]
            : [];
      // Like the backend: Open Food Facts is worth asking below 5 hits from 3 characters.
      const q = decodeURIComponent(url.split("q=")[1] ?? "");
      return json({ hits, off_more: q.length >= 3 && hits.length < 5 });
    }
    if (url === "/api/v1/plates/extract" && method === "POST") return json(plate);
    if (url === "/api/v1/plates/dictate" && method === "POST") return json(plate);
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
      return logGroup(known.name, items, body.meal, body.eaten_at);
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
    if (barcode && barcode[1].padStart(14, "0") === muesliDraft.gtin) return json(muesliDraft);
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
    if (url === "/api/v1/recipes" && method === "GET") return json([skyrRecipe]);
    if (url === "/api/v1/recipes" && method === "POST") {
      if (body.name === "kaputt") return json({ detail: "broken" }, 500);
      const items: Item[] = body.items;
      const totals = sum(items.map((item) => scale(byId(item.food_id).per_100, item.grams)));
      const grams = (body.cooked_grams ?? items.reduce((all, item) => all + item.grams, 0)) / body.portions;
      const serving = { label: "1 Portion", grams, origin: "own" as const };
      foods[skyrRecipe.food_id] = {
        ...foods[skyrRecipe.food_id],
        name: body.name,
        per_100: { ...scale(totals, 100 / (grams * body.portions) * 100), fiber: null, sugar: null, sat_fat: null, salt: null },
        servings: [{ id: 9, ...serving, is_default: true }],
        standard_serving: serving,
      };
      return json({ ...skyrRecipe, ...body, items: skyrRecipe.items, portion_grams: grams, totals }, 201);
    }
    const image = url.match(/^\/api\/v1\/foods\/(\d+)\/image$/);
    if (image && method === "PUT" && foods[Number(image[1])]) {
      foods[Number(image[1])] = { ...foods[Number(image[1])], image_path: "photo.webp" };
      return json(foods[Number(image[1])]);
    }
    if (url === `/api/v1/recipes/${skyrRecipe.id}`) {
      return json(method === "PATCH" ? { ...skyrRecipe, ...body, items: skyrRecipe.items } : skyrRecipe);
    }
    const food = url.match(/^\/api\/v1\/foods\/(\d+)$/);
    if (food && method === "GET" && foods[Number(food[1])]) return json(foods[Number(food[1])]);
    if (food && method === "PATCH") {
      foods[7] = { ...foods[7], name: body.name };
      return json(foods[7]);
    }
    if (url === "/api/v1/entries" && method === "POST" && body.food_id === skyrRecipe.food_id) {
      const dish = foods[skyrRecipe.food_id];
      const grams = body.grams ?? dish.standard_serving.grams;
      const entry = {
        ...bananaEntry,
        id: 100 + calls.length,
        food: { ...ref(dish), recipe: true, image_path: dish.image_path },
        grams,
        macros: scale(dish.per_100, grams),
      };
      entries = [...entries, entry];
      return json(entry, 201);
    }
    if (url === "/api/v1/entries" && method === "POST") {
      // A backfilled entry lands on the day of its time (none of the fake's are before 04:00).
      const entry = {
        ...bananaEntry,
        id: 100 + calls.length,
        ...(body.eaten_at ? { eaten_at: body.eaten_at, day: body.eaten_at.slice(0, 10) } : {}),
      };
      entries = [...entries, entry];
      return json(entry, 201);
    }
    const match = url.match(/^\/api\/v1\/entries\/(\d+)$/);
    if (match && method === "PATCH") {
      entries = entries.map((e) => (e.id === Number(match[1]) ? { ...e, grams: body.grams } : e));
      return json(entries.find((e) => e.id === Number(match[1])));
    }
    if (match && method === "DELETE") {
      entries = entries.filter((e) => e.id !== Number(match[1]));
      return json(null, 204);
    }
    return json({ detail: "not faked" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls };
}

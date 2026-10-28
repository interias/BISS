// Client for the BISS API (/api/v1, proxied by the Next rewrite). Types follow the
// OpenAPI schema; all logic stays in the backend (ADR-0003).

export type Meal = "breakfast" | "lunch" | "snack" | "dinner";
export type Source = "own" | "bls" | "off";
export type Basis = "g" | "ml";

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

export type StandardServing = {
  label: string;
  grams: number;
  origin: "package" | "estimated" | "own" | null;
};

export type FoodSummary = {
  id: number;
  name: string;
  brand: string | null;
  source: Source;
  basis: Basis;
  per_100: Macros;
  standard_serving: StandardServing;
};

export type Serving = {
  id: number;
  label: string;
  grams: number;
  origin: "package" | "estimated" | "own";
  is_default: boolean;
};

export type FoodDetail = Omit<FoodSummary, "per_100"> & {
  gtin: string | null;
  source_id: string | null;
  density: number;
  image_path: string | null;
  per_100: Macros & {
    fiber: number | null;
    sugar: number | null;
    sat_fat: number | null;
    salt: number | null;
  };
  servings: Serving[];
};

export type Per100 = FoodDetail["per_100"];

/** A scanned product: a stored food (id set) or a draft from Open Food Facts (id null). */
export type BarcodeFood = Omit<FoodDetail, "id" | "gtin" | "source_id" | "servings"> & {
  id: number | null;
  gtin: string;
  servings: Omit<Serving, "id">[];
};

/** What the editor sends; servings with an id are changed, the others are new. */
export type FoodWrite = {
  name: string;
  brand: string | null;
  per_100: Per100;
  servings: { id?: number; label: string; grams: number; is_default: boolean }[];
};

export type Atwater = { computed_kcal: number; deviation_pct: number | null; ok: boolean };

export type Entry = {
  id: number;
  food: { id: number; name: string; brand: string | null; source: Source };
  grams: number;
  meal: Meal;
  eaten_at: string;
  day: string;
  macros: Macros;
};

export type MealEntries = { meal: Meal; totals: Macros; entries: Entry[] };

export type Day = {
  date: string;
  totals: Macros;
  targets: Macros;
  meals: MealEntries[];
  suggested_meal: Meal;
};

const BASE = "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(BASE + path, {
    ...init,
    // A FormData body sets its own multipart header with the boundary.
    headers: typeof init?.body === "string" ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${response.status}`);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** The current day; the backend resolves "today" with the 04:00 boundary. */
export const getToday = () => request<Day>("/days/today");
export const getRecent = () => request<FoodSummary[]>("/recent");
export const searchFoods = (q: string) =>
  request<FoodSummary[]>(`/foods/search?q=${encodeURIComponent(q)}`);
export const getFood = (id: number) => request<FoodDetail>(`/foods/${id}`);

/**
 * Barcode chain (ADR-0003): the raw code goes to the backend, which normalises it to GTIN-14.
 * A miss (404) carries that GTIN; the camera then offers the label photo.
 */
export async function scanBarcode(code: string): Promise<{ food: BarcodeFood } | { gtin: string }> {
  const path = `/foods/barcode/${encodeURIComponent(code)}`;
  const response = await fetch(BASE + path);
  if (response.status === 404) return { gtin: ((await response.json()) as { gtin: string }).gtin };
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return { food: (await response.json()) as BarcodeFood };
}

/**
 * Exactly one of food_id and gtin; a gtin logs a scanned draft and stores it as food.
 * Without grams the backend takes the standard serving, without meal its suggestion.
 */
export const createEntry = (
  body: ({ food_id: number } | { gtin: string }) & { grams?: number; meal?: Meal },
) =>
  request<Entry>("/entries", { method: "POST", body: JSON.stringify(body) });
export const updateEntry = (id: number, body: { grams?: number; meal?: Meal }) =>
  request<Entry>(`/entries/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteEntry = (id: number) => request<void>(`/entries/${id}`, { method: "DELETE" });

/** Image URL of a food's `image_path` (the file name only). */
export const imageUrl = (imagePath: string) => `${BASE}/images/${imagePath}`;

/** Atwater check of values per 100 g; the backend decides what is plausible (ADR-0003). */
export const validateFood = (body: Pick<Per100, "kcal" | "protein" | "carbs" | "fat" | "fiber">) =>
  request<{ atwater: Atwater }>("/foods/validate", { method: "POST", body: JSON.stringify(body) });

export const createFood = (body: FoodWrite) =>
  request<FoodDetail>("/foods", { method: "POST", body: JSON.stringify(body) });

/** The servings are the complete new list; the backend changes the origin of edited ones. */
export const updateFood = (id: number, body: FoodWrite) =>
  request<FoodDetail>(`/foods/${id}`, { method: "PATCH", body: JSON.stringify(body) });

/** The backend converts the photo to WebP (512 px) and answers with the new `image_path`. */
export function uploadFoodImage(id: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<FoodDetail>(`/foods/${id}/image`, { method: "PUT", body: form });
}

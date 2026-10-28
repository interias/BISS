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
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
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

/** Without grams the backend takes the standard serving, without meal its suggestion. */
export const createEntry = (body: { food_id: number; grams?: number; meal?: Meal }) =>
  request<Entry>("/entries", { method: "POST", body: JSON.stringify(body) });
export const updateEntry = (id: number, body: { grams?: number; meal?: Meal }) =>
  request<Entry>(`/entries/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteEntry = (id: number) => request<void>(`/entries/${id}`, { method: "DELETE" });

// Client for the BISS API (/api/v1, proxied by the Next rewrite). Types follow the
// OpenAPI schema; all logic stays in the backend (ADR-0003).

export type Meal = "breakfast" | "lunch" | "snack" | "dinner";
export type Source = "own" | "bls" | "off";
export type Basis = "g" | "ml";
/** Symbol group of a food without a photo; the backend derives it (ADR-0003). */
export type Category =
  | "bread"
  | "grains"
  | "fruit"
  | "vegetables"
  | "legumes"
  | "potatoes"
  | "dairy"
  | "eggs"
  | "meat"
  | "sausage"
  | "fish"
  | "fats"
  | "sweets"
  | "drinks"
  | "dishes"
  | "other";

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
  /** g/ml; the preview turns grams into ml with it for basis ml. */
  density: number;
  /** null: no group known, the symbol of "other" shows. */
  category: Category | null;
  per_100: Macros;
  standard_serving: StandardServing;
};

/**
 * A search hit: a food (id set) or a product of the Open Food Facts cache (id null), which
 * the barcode chain answers as a draft and which is logged by its GTIN.
 */
export type SearchHit = Omit<FoodSummary, "id"> &
  ({ id: number; gtin: string | null } | { id: null; gtin: string });

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

/**
 * What the editor sends; servings with an id are changed, the others are new. `basis`,
 * `gtin` (the scanned code, 409 when another food has it) and the `origin` of a serving read
 * from a label with its `as_read` values only when it creates a food; the backend makes a
 * serving that differs from them own (ADR-0003).
 */
export type FoodWrite = {
  name: string;
  brand: string | null;
  basis?: Basis;
  gtin?: string;
  category?: Category | null;
  per_100: Per100;
  servings: {
    id?: number;
    label: string;
    grams: number;
    is_default: boolean;
    origin?: Serving["origin"];
    as_read?: { label: string; grams: number };
  }[];
};

export type Atwater = { computed_kcal: number; deviation_pct: number | null; ok: boolean };

/** The draft read from a label (SPEC 7); its field names differ from the food's. */
export type LabelDraft = {
  name: string;
  brand: string | null;
  package_size: { amount: number; unit: Basis } | null;
  per_100: {
    basis: Basis;
    state: "as_sold" | "prepared";
    energy_kj: number;
    energy_kcal: number;
    fat: number;
    saturated_fat: number | null;
    carbs: number;
    sugar: number | null;
    fiber: number | null;
    protein: number;
    salt: number | null;
  };
  servings: { label: string; amount: number; unit: Basis; source: "package" | "estimated" }[];
  confidence: number;
  notes: string;
  /** From the request, never read from the photo. */
  gtin: string | null;
};

export type LabelViolation = { rule: "atwater" | "energy" | "sugar" | "saturated_fat"; detail: string };

export type LabelExtraction = {
  draft: LabelDraft;
  validation: { ok: boolean; atwater: Atwater; violations: LabelViolation[] };
  model: string;
  attempts: number;
};

export type Entry = {
  id: number;
  food: { id: number; name: string; brand: string | null; source: Source; category: Category | null };
  grams: number;
  meal: Meal;
  eaten_at: string;
  day: string;
  macros: Macros;
  /** The plate the entry was logged with (POST /entries/group); null alone. */
  group_id: string | null;
  group_name: string | null;
};

/** A plate within a meal; its entries are those of the meal with these ids. */
export type DayGroup = { group_id: string; group_name: string; totals: Macros; entry_ids: number[] };

export type MealEntries = { meal: Meal; totals: Macros; entries: Entry[]; groups: DayGroup[] };

/** A plate or Schnellzugriff in the diary with its entries by time. */
export type DayGroupRow = {
  kind: "group";
  group_id: string;
  group_name: string;
  meal: Meal;
  eaten_at: string;
  totals: Macros;
  entries: Entry[];
};

/** A row of the diary: an entry alone or a group. */
export type DayRow = { kind: "entry"; entry: Entry } | DayGroupRow;

export type Day = {
  date: string;
  totals: Macros;
  targets: Macros;
  /** The diary as the app shows it, newest first; `meals` stays for other API clients. */
  rows: DayRow[];
  meals: MealEntries[];
  suggested_meal: Meal;
};

export type FoodRef = Entry["food"];

/**
 * An ingredient read from a plate (SPEC 7a). `food_id` null: nothing matched, there are no
 * values ("nicht zugeordnet"). `certainty` comes from the backend (ADR-0003).
 */
export type PlateItem = {
  food_id: number | null;
  name: string;
  grams: number;
  confidence: number;
  certainty: "recognized" | "guessed";
  food: FoodRef | null;
  /** Of the matched food: per_100 is per 100 g or 100 ml, density turns grams into ml. */
  basis: Basis | null;
  density: number | null;
  per_100: Macros | null;
  macros: Macros | null;
};

export type PlateExtraction = {
  dish: string;
  items: PlateItem[];
  totals: Macros;
  notes: string;
  model: string;
  attempts: number;
};

export type EntryGroup = {
  group_id: string;
  group_name: string;
  meal: Meal;
  day: string;
  totals: Macros;
  entries: Entry[];
};

const BASE = "/api/v1";

/** A response that is not ok; `status` tells e.g. a taken GTIN (409) from a bad photo (422). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(BASE + path, {
    ...init,
    // A FormData body sets its own multipart header with the boundary.
    headers: typeof init?.body === "string" ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok) throw new ApiError(`${init?.method ?? "GET"} ${path}: ${response.status}`, response.status);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** The current day; the backend resolves "today" with the 04:00 boundary. */
export const getToday = () => request<Day>("/days/today");
export const getRecent = () => request<FoodSummary[]>("/recent");
/** The local search; `off_more` says the backend finds asking Open Food Facts worthwhile. */
export const searchFoods = (q: string) =>
  request<{ hits: SearchHit[]; off_more: boolean }>(`/foods/search?q=${encodeURIComponent(q)}`);

/**
 * Open Food Facts text search (ADR-0011): products the local search does not show. A failure
 * is no error but an empty list with a `reason`.
 */
export const searchOff = (q: string) =>
  request<{ hits: SearchHit[]; reason: "short" | "limit" | "timeout" | "error" | null }>(
    `/foods/search/off?q=${encodeURIComponent(q)}`,
  );
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

/**
 * Label photo plus the scanned GTIN, if any → draft with validation (SPEC 7). The backend
 * only reads the photo and does not store it; the GTIN never comes from the photo.
 */
export function extractLabel(photo: Blob, gtin?: string) {
  const form = new FormData();
  form.append("file", photo, photo instanceof File ? photo.name : "label.jpg");
  if (gtin) form.append("gtin", gtin);
  return request<LabelExtraction>("/labels/extract", { method: "POST", body: form });
}

/** Plate photo → dish with ingredients, amounts and food matches (SPEC 7a); nothing is logged. */
export function extractPlate(photo: Blob) {
  const form = new FormData();
  form.append("file", photo, photo instanceof File ? photo.name : "plate.jpg");
  return request<PlateExtraction>("/plates/extract", { method: "POST", body: form });
}

/** One entry per item with a shared group; without meal and time the backend takes its defaults. */
export const createEntryGroup = (body: {
  group_name: string;
  items: { food_id: number; grams: number }[];
  meal?: Meal;
  eaten_at?: string;
}) => request<EntryGroup>("/entries/group", { method: "POST", body: JSON.stringify(body) });

/** Removes every entry of the plate. */
export const deleteEntryGroup = (groupId: string) =>
  request<void>(`/entries/group/${groupId}`, { method: "DELETE" });

/** An item of a Schnellzugriff; `density` turns grams into ml for the preview of an ml food. */
export type ComboItem = { food: FoodSummary; grams: number; density: number; macros: Macros };

/** Schnellzugriff (ADR-0010): a saved template, logged as an entry group like a plate. */
export type Combo = { id: number; name: string; items: ComboItem[]; totals: Macros };

export type ComboItemWrite = { food_id: number; grams: number };

export const getCombos = () => request<Combo[]>("/combos");

/** From items, or from an entry group of the diary (its name unless one is given). */
export const createCombo = (
  body: { name: string; items: ComboItemWrite[] } | { name?: string; group_id: string },
) => request<Combo>("/combos", { method: "POST", body: JSON.stringify(body) });

/** Items, when sent, replace all items of the template. */
export const updateCombo = (id: number, body: { name?: string; items?: ComboItemWrite[] }) =>
  request<Combo>(`/combos/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteCombo = (id: number) => request<void>(`/combos/${id}`, { method: "DELETE" });

/**
 * Logs the combo as an entry group named like it; without meal the backend suggests one.
 * `items` change this entry only, never the template.
 */
export const logCombo = (id: number, body: { meal?: Meal; items?: ComboItemWrite[] } = {}) =>
  request<EntryGroup>(`/combos/${id}/log`, { method: "POST", body: JSON.stringify(body) });

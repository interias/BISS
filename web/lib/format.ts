import type { Basis, Category, Meal, Serving, Source } from "@/lib/api";

export const MEALS: Meal[] = ["breakfast", "lunch", "snack", "dinner"];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Frühstück",
  lunch: "Mittag",
  snack: "Snack",
  dinner: "Abend",
};

export const SOURCE_LABELS: Record<Source, string> = {
  own: "Eigene DB",
  bls: "BLS",
  off: "Open Food Facts",
};

/** The symbol groups as the editor offers them. */
export const CATEGORY_LABELS: Record<Category, string> = {
  bread: "Brot & Brötchen",
  grains: "Getreide & Nudeln",
  fruit: "Obst",
  vegetables: "Gemüse & Pilze",
  legumes: "Hülsenfrüchte, Nüsse & Samen",
  potatoes: "Kartoffeln",
  dairy: "Milch & Käse",
  eggs: "Eier",
  meat: "Fleisch",
  sausage: "Wurst & Schinken",
  fish: "Fisch",
  fats: "Fette & Öle",
  sweets: "Süßes & Kuchen",
  drinks: "Getränke",
  dishes: "Gerichte",
  other: "Sonstiges",
};

export const ORIGIN_LABELS: Record<Serving["origin"], string> = {
  package: "Packung",
  estimated: "geschätzt",
  own: "eigene",
};

/** German number format without decimals unless asked, e.g. 2.400. */
export const fmt = (n: number, digits = 0) =>
  n.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** "Banane, roh" → "Banane", as on the recent chips of the prototype. */
export const shortName = (name: string) => name.split(",")[0];

/** A chip label of about `max` characters: longer names end in "…" (full name in aria-label). */
export const clip = (name: string, max = 14) =>
  name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;

/** Brand line; generic foods show their source like the prototype ("generisch · BLS"). */
export const brandLine = (brand: string | null, source: Source) =>
  brand ?? `generisch · ${SOURCE_LABELS[source]}`;

export const per100Unit = (basis: Basis) => (basis === "ml" ? "100 ml" : "100 g");

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Header date for the ISO day the backend returns: "Heute · Mi 28. Okt". */
export function headerDate(isoDay: string) {
  const [y, m, d] = isoDay.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `Heute · ${WEEKDAYS[weekday]} ${d}. ${MONTHS[m - 1]}`;
}

/** Clock time of an entry in Europe/Berlin, e.g. "07:12". */
export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Berlin",
  });

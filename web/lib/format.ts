import type { Basis, Category, Meal, Serving, Source } from "@/lib/api";
import { addDays, isoWeek } from "@/lib/dates";

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

/** A name that may wrap after a slash ("Speisesalz/Siedesalz"), not in the middle of a word. */
export const breakable = (name: string) => name.replaceAll("/", "/​");

/** Where a listed food comes from, in one word: its brand, else its source ("BLS"). */
export const originLine = (brand: string | null, source: Source) => brand ?? SOURCE_LABELS[source];

export const per100Unit = (basis: Basis) => (basis === "ml" ? "100 ml" : "100 g");

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
/** Monday first, as the calendar and the statistics list them. */
export const WEEKDAYS_FROM_MONDAY = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const parts = (isoDay: string) => {
  const [y, m, d] = isoDay.split("-").map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** A day in short: "Mi 18. Nov". */
export function shortDay(isoDay: string) {
  const { m, d, weekday } = parts(isoDay);
  return `${WEEKDAYS[weekday]} ${d}. ${MONTHS[m - 1]}`;
}

/** The weekday alone: "Mi". */
export const weekdayShort = (isoDay: string) => WEEKDAYS[parts(isoDay).weekday];

/** The day of the month alone: 18. */
export const dayOfMonth = (isoDay: string) => parts(isoDay).d;

/** Header date: "Heute · Do 19. Nov", "Gestern · Mi 18. Nov", else "Di 10. Nov". */
export function dayLabel(isoDay: string, today: string) {
  if (isoDay === today) return `Heute · ${shortDay(isoDay)}`;
  return isoDay === addDays(today, -1) ? `Gestern · ${shortDay(isoDay)}` : shortDay(isoDay);
}

/** "November 2026". */
export function monthTitle(isoDay: string) {
  const { y, m } = parts(isoDay);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** "seit heute" or "seit Do 1. Okt": since when a goal applies. */
export const sinceDay = (isoDay: string, today: string) => (isoDay === today ? "seit heute" : `seit ${shortDay(isoDay)}`);

/** A share as a percentage: 0.1 → "10 %". */
export const percent = (share: number) => `${fmt(share * 100)} %`;

/**
 * Name and dates of a statistics period: "Letzte Woche" with "9. – 15. Nov", "Diese Woche",
 * "KW 45"; "Letzter Monat" with "Oktober 2026", "Dieser Monat".
 */
export function periodTitle({ kind, offset, from, to }: { kind: "week" | "month"; offset: number; from: string; to: string }) {
  if (kind === "month") {
    const name = offset === 0 ? "Dieser Monat" : offset === -1 ? "Letzter Monat" : MONTH_NAMES[parts(from).m - 1];
    return { name, range: monthTitle(from) };
  }
  const a = parts(from);
  const b = parts(to);
  const range =
    a.m === b.m ? `${a.d}. – ${b.d}. ${MONTHS[b.m - 1]}` : `${a.d}. ${MONTHS[a.m - 1]} – ${b.d}. ${MONTHS[b.m - 1]}`;
  if (offset === 0) return { name: "Diese Woche", range };
  if (offset === -1) return { name: "Letzte Woche", range };
  return { name: `KW ${isoWeek(from)}`, range };
}

/** "1 Tag", "2 Tagen": the dative after "an" and "aus". */
export const daysDative = (n: number) => `${fmt(n)} ${n === 1 ? "Tag" : "Tagen"}`;

/** Clock time of an entry in Europe/Berlin, e.g. "07:12". */
export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Berlin",
  });

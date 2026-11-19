// What the statistics tab says about the numbers of GET /stats; all counting is the
// backend's (ADR-0003, ADR-0015). Never a judgement: no red, no grades.
import type { Stats } from "@/lib/api";
import { period, type PeriodKind } from "@/lib/dates";
import { fmt } from "@/lib/format";

/** The top of the kcal axis: at least 3.000, else the next 500 above the highest value. */
export const chartTop = (values: number[]) => Math.max(3000, Math.ceil(Math.max(0, ...values) / 500) * 500);

/** Less than this apart counts as on the goal, or as about the same as before. */
const NEAR = 20;

/** "124 unter deinem Ziel von 2.400", "deinem Ziel (im Schnitt 2.450)" when goals changed. */
export function goalLine(average: number, target: number, vary: boolean) {
  const goal = vary ? `deinem Ziel (im Schnitt ${fmt(target)})` : `deinem Ziel von ${fmt(target)}`;
  const delta = Math.round(average - target);
  if (Math.abs(delta) < NEAR) return `Genau auf ${goal}.`;
  return `${fmt(Math.abs(delta))} ${delta > 0 ? "über" : "unter"} ${goal}.`;
}

/** "67 kcal weniger als in der Woche davor"; nothing when the period before has no days. */
export function compareLine(average: number, previous: number | null, kind: PeriodKind) {
  if (previous === null) return null;
  const before = kind === "week" ? "in der Woche davor" : "im Monat davor";
  const delta = Math.round(average - previous);
  if (Math.abs(delta) < NEAR) return `Etwa so viel wie ${before}.`;
  return `${fmt(Math.abs(delta))} kcal ${delta > 0 ? "mehr" : "weniger"} als ${before}.`;
}

/** The share of the kcal at each time of day, 0 to 1, in the order of the day. */
export function timeShares(times: Stats["times_of_day"]) {
  const values = [times.morning, times.midday, times.afternoon, times.evening];
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  return values.map((value) => value / sum);
}

/** Whether the period before can be shown: it reaches the first day of the diary. */
export const canStepBack = (stats: Stats | null) =>
  stats !== null && stats.first_day !== null && stats.previous.to >= stats.first_day;

/**
 * The period the tab opens on: this week or this month, but the one before on its first day,
 * when the current one has no finished day yet (today counts from tomorrow on).
 */
export const openingOffset = (kind: PeriodKind, today: string) => (period(kind, 0, today).from === today ? -1 : 0);

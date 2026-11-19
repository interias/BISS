// Calendar days as ISO strings ("2026-11-19"), counted in UTC so no time zone shifts them.
// The backend decides which day is today (Europe/Berlin, 04:00 boundary, ADR-0003); these
// helpers only step from the days it returns. The words for days live in lib/format.ts.

const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + n);
  return toIso(date);
};

/** 0 for Monday up to 6 for Sunday. */
export const weekdayIndex = (iso: string) => (toDate(iso).getUTCDay() + 6) % 7;

export const mondayOf = (iso: string) => addDays(iso, -weekdayIndex(iso));

/** The first day of the month `n` months after the one of `iso`. */
export const monthStart = (iso: string, n = 0) => {
  const date = toDate(iso);
  return toIso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1)));
};

export const monthEnd = (iso: string) => addDays(monthStart(iso, 1), -1);

/** Every day from `from` to `to` inclusive. */
export function daysFrom(from: string, to: string) {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** ISO 8601 calendar week: the week with the year's first Thursday is week 1. */
export function isoWeek(iso: string) {
  const thursday = toDate(addDays(mondayOf(iso), 3));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / 86_400_000 / 7) + 1;
}

/** A week runs from Monday to Sunday, a month is a calendar month (SPEC 4). */
export type PeriodKind = "week" | "month";

/** The period `offset` steps from the current one: −1 is last week or last month. */
export type Period = { kind: PeriodKind; offset: number; from: string; to: string };

export function period(kind: PeriodKind, offset: number, today: string): Period {
  if (kind === "week") {
    const from = addDays(mondayOf(today), offset * 7);
    return { kind, offset, from, to: addDays(from, 6) };
  }
  const from = monthStart(today, offset);
  return { kind, offset, from, to: monthEnd(from) };
}

const BERLIN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The wall clock in Berlin at an instant, as if it were UTC. */
function berlinWall(instant: number) {
  const part = Object.fromEntries(BERLIN.formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second);
}

/**
 * The time of an entry backfilled on `day`: that day at the clock time of now in Berlin, as
 * an entry now would have. Before 04:00 an entry counts to the day before, so the clock time
 * goes on the next calendar day and the backend maps it back to `day` (SPEC 4).
 */
export function backfillEatenAt(day: string, now = new Date()) {
  const clock = new Date(berlinWall(now.getTime()));
  const target = clock.getUTCHours() < 4 ? addDays(day, 1) : day;
  const date = toDate(target);
  const wall = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    clock.getUTCHours(),
    clock.getUTCMinutes(),
    clock.getUTCSeconds(),
  );
  // Berlin is ahead of UTC by its offset on that day; a second pass settles a DST change.
  let instant = wall - (berlinWall(wall) - wall);
  instant = wall - (berlinWall(instant) - instant);
  return new Date(instant).toISOString();
}

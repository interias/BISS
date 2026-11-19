import { expect, test } from "vitest";
import { canStepBack, chartTop, compareLine, goalLine, timeShares } from "./stats";
import { dayLabel, daysDative, periodTitle, shortDay, sinceDay } from "./format";
import { period } from "./dates";

test("the kcal axis reaches at least 3.000, else the next 500 above the highest bar", () => {
  expect(chartTop([2100, 2400])).toBe(3000);
  expect(chartTop([3010, 2400])).toBe(3500);
  expect(chartTop([])).toBe(3000);
});

test("the answer says the distance to the goal and to the period before", () => {
  expect(goalLine(2276, 2400, false)).toBe("124 unter deinem Ziel von 2.400.");
  expect(goalLine(2520, 2450, true)).toBe("70 über deinem Ziel (im Schnitt 2.450).");
  expect(goalLine(2410, 2400, false)).toBe("Genau auf deinem Ziel von 2.400.");
  expect(compareLine(2276, 2343, "week")).toBe("67 kcal weniger als in der Woche davor.");
  expect(compareLine(2500, 2343, "month")).toBe("157 kcal mehr als im Monat davor.");
  expect(compareLine(2350, 2343, "week")).toBe("Etwa so viel wie in der Woche davor.");
  expect(compareLine(2350, null, "week")).toBeNull();
});

test("the times of day are shares of the kcal", () => {
  expect(timeShares({ morning: 1, midday: 1, afternoon: 0, evening: 2 })).toEqual([0.25, 0.25, 0, 0.5]);
  expect(timeShares({ morning: 0, midday: 0, afternoon: 0, evening: 0 })).toEqual([0, 0, 0, 0]);
});

test("the period before can be shown while it reaches the first day of the diary", () => {
  expect(canStepBack(null)).toBe(false);
  const stats = (first_day: string | null) =>
    ({ first_day, previous: { from: "2026-11-02", to: "2026-11-08", average_kcal: null } }) as never;
  // A week without entries in between does not stop paging back.
  expect(canStepBack(stats("2026-08-01"))).toBe(true);
  expect(canStepBack(stats("2026-11-08"))).toBe(true);
  expect(canStepBack(stats("2026-11-09"))).toBe(false);
  expect(canStepBack(stats(null))).toBe(false);
});

test("days and periods are named in German", () => {
  const today = "2026-11-19";
  expect(dayLabel(today, today)).toBe("Heute · Do 19. Nov");
  expect(dayLabel("2026-11-18", today)).toBe("Gestern · Mi 18. Nov");
  expect(dayLabel("2026-11-10", today)).toBe("Di 10. Nov");
  expect(shortDay("2026-10-01")).toBe("Do 1. Okt");
  expect(sinceDay(today, today)).toBe("seit heute");
  expect(sinceDay("2026-10-01", today)).toBe("seit Do 1. Okt");
  expect(periodTitle(period("week", -1, today))).toEqual({ name: "Letzte Woche", range: "9. – 15. Nov" });
  expect(periodTitle(period("week", 0, today))).toEqual({ name: "Diese Woche", range: "16. – 22. Nov" });
  expect(periodTitle(period("week", -3, today))).toEqual({ name: "KW 44", range: "26. Okt – 1. Nov" });
  expect(periodTitle(period("month", -1, today))).toEqual({ name: "Letzter Monat", range: "Oktober 2026" });
  expect(periodTitle(period("month", 0, today))).toEqual({ name: "Dieser Monat", range: "November 2026" });
  expect(periodTitle(period("month", -2, today))).toEqual({ name: "September", range: "September 2026" });
  expect(daysDative(1)).toBe("1 Tag");
  expect(daysDative(6)).toBe("6 Tagen");
});

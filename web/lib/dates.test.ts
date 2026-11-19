import { expect, test } from "vitest";
import { addDays, backfillEatenAt, daysFrom, isoWeek, mondayOf, monthEnd, monthStart, period } from "./dates";

test("days step over months and years", () => {
  expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(daysFrom("2026-02-27", "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
});

test("a week runs from Monday to Sunday, a month is a calendar month", () => {
  // Thursday, 19 November 2026.
  expect(mondayOf("2026-11-19")).toBe("2026-11-16");
  expect(mondayOf("2026-11-22")).toBe("2026-11-16");
  expect(period("week", -1, "2026-11-19")).toEqual({ kind: "week", offset: -1, from: "2026-11-09", to: "2026-11-15" });
  expect(period("week", 0, "2026-11-19")).toMatchObject({ from: "2026-11-16", to: "2026-11-22" });
  expect(period("month", -1, "2026-11-19")).toEqual({ kind: "month", offset: -1, from: "2026-10-01", to: "2026-10-31" });
  expect(period("month", -11, "2026-11-19")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  expect(monthStart("2026-03-31", -1)).toBe("2026-02-01");
  expect(monthEnd("2028-02-10")).toBe("2028-02-29");
});

test("calendar weeks follow ISO 8601", () => {
  expect(isoWeek("2026-11-09")).toBe(46);
  expect(isoWeek("2026-01-01")).toBe(1);
  // 1 January 2027 is a Friday: it belongs to week 53 of 2026.
  expect(isoWeek("2027-01-01")).toBe(53);
});

test("a backfilled entry gets its day at the clock time of now in Berlin", () => {
  // 14:05 in Berlin (winter time) on the 19th, backfilled on the 18th.
  expect(backfillEatenAt("2026-11-18", new Date("2026-11-19T13:05:30Z"))).toBe("2026-11-18T13:05:30.000Z");
  // A summer day is two hours ahead of UTC: still 14:05 in Berlin.
  expect(backfillEatenAt("2026-07-10", new Date("2026-11-19T13:05:30Z"))).toBe("2026-07-10T12:05:30.000Z");
});

test("before 04:00 the time goes on the next calendar day, which counts to the chosen day", () => {
  // 02:30 in Berlin: an entry at 02:30 on the 19th counts to the 18th.
  expect(backfillEatenAt("2026-11-18", new Date("2026-11-20T01:30:00Z"))).toBe("2026-11-19T01:30:00.000Z");
});

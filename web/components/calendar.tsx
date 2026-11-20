"use client";

import { useEffect, useState } from "react";
import { getDays, type DayTotals } from "@/lib/api";
import { addDays, daysFrom, monthEnd, weekdayIndex } from "@/lib/dates";
import { dayLabel, dayOfMonth, fmt, WEEKDAYS_FROM_MONDAY } from "@/lib/format";
import { cn } from "@/lib/utils";

const R = 15;
const C = 2 * Math.PI * R;

/**
 * A small ring like the kcal ring: the share of that day's kcal goal, dashed without entries.
 * `inverted` draws it on the accent of a selected day.
 */
export function DayRing({
  day,
  size,
  text,
  inverted,
}: {
  day: DayTotals | undefined;
  size: number;
  text?: number;
  inverted?: boolean;
}) {
  const logged = !!day && day.entries > 0;
  const share = logged && day.targets.kcal > 0 ? Math.min(day.totals.kcal / day.targets.kcal, 1) : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="block">
      <circle
        cx="20"
        cy="20"
        r={R}
        fill="none"
        stroke={inverted ? "transparent" : "var(--biss-line)"}
        strokeWidth="3.2"
        strokeDasharray={logged ? undefined : "2.5 3.5"}
      />
      {logged && (
        <circle
          cx="20"
          cy="20"
          r={R}
          fill="none"
          stroke={inverted ? "var(--biss-accent-ink)" : "var(--biss-accent)"}
          strokeWidth="3.2"
          strokeDasharray={`${C * share} ${C}`}
          transform="rotate(-90 20 20)"
        />
      )}
      {text !== undefined && (
        <text x="20" y="24.4" textAnchor="middle" fill="currentColor" className="text-[12.5px] tabular-nums">
          {text}
        </text>
      )}
    </svg>
  );
}

/**
 * The days from `from` to `to` by date, up to today at most; empty until they are loaded.
 * A new `attempt` asks again.
 */
export function useDayTotals(
  from: string,
  to: string,
  today: string,
  onError: (failure: unknown) => void,
  attempt = 0,
) {
  const [loaded, setLoaded] = useState<{ key: string; days: Map<string, DayTotals> } | null>(null);
  const last = to < today ? to : today;
  const key = `${from}/${last}`;
  useEffect(() => {
    if (last < from) return;
    let live = true;
    getDays(from, last).then(
      (days) => live && setLoaded({ key, days: new Map(days.map((day) => [day.date, day])) }),
      (failure) => live && onError(failure),
    );
    return () => {
      live = false;
    };
  }, [from, last, key, onError, attempt]);
  return loaded?.key === key ? loaded.days : EMPTY;
}

const EMPTY = new Map<string, DayTotals>();

/** "Mi 18. Nov, 2.310 kcal" or "…, keine Einträge": the name of a day's button. */
export function dayName(date: string, today: string, day: DayTotals | undefined) {
  return `${dayLabel(date, today)}, ${day && day.entries > 0 ? `${fmt(day.totals.kcal)} kcal` : "keine Einträge"}`;
}

/**
 * A month from Monday to Sunday with a ring per day. Today stands in the accent colour, the
 * selected day is filled, days after today cannot be picked.
 */
export function MonthCalendar({
  month,
  today,
  selected,
  days,
  onPick,
}: {
  month: string;
  today: string;
  selected?: string;
  days: Map<string, DayTotals>;
  onPick: (date: string) => void;
}) {
  const dates = daysFrom(month, monthEnd(month));
  const lead = weekdayIndex(month);
  return (
    <div className="grid grid-cols-7 justify-items-center gap-y-px">
      {WEEKDAYS_FROM_MONDAY.map((weekday) => (
        <span key={weekday} aria-hidden="true" className="py-[3px] text-[10.5px] font-semibold text-muted-foreground">
          {weekday}
        </span>
      ))}
      {Array.from({ length: lead }, (_, i) => (
        <i key={`lead-${addDays(month, i - lead)}`} />
      ))}
      {dates.map((date) => {
        const future = date > today;
        const isSelected = date === selected;
        return (
          <button
            key={date}
            type="button"
            disabled={future}
            aria-label={dayName(date, today, days.get(date))}
            aria-current={isSelected ? "date" : undefined}
            onClick={() => onPick(date)}
            className={cn(
              "grid h-[42px] w-full max-w-[44px] place-items-center rounded-xl font-semibold disabled:opacity-40",
              isSelected && "bg-primary text-primary-foreground",
              date === today && "font-extrabold",
              !isSelected && date === today && "text-primary",
            )}
          >
            {future ? (
              <span className="text-[12.5px] text-muted-foreground tabular-nums">{dayOfMonth(date)}</span>
            ) : (
              <DayRing day={days.get(date)} size={38} text={dayOfMonth(date)} inverted={isSelected} />
            )}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import { addDays, monthEnd, monthStart } from "@/lib/dates";
import { monthTitle } from "@/lib/format";
import { kicker } from "@/lib/styles";
import { MonthCalendar, useDayTotals } from "@/components/calendar";
import { BackIcon, ForwardIcon } from "@/components/icons";
import { SheetTitle } from "@/components/sheet";

/**
 * "Tag wählen" (SPEC 3): a month with −/+ and a ring per day; a tap opens that day. Below,
 * "Heute" and "Gestern". Nothing after today can be picked.
 */
export function DayPicker({
  today,
  selected,
  onPick,
  onError,
}: {
  today: string;
  selected: string;
  onPick: (date: string) => void;
  onError: (failure: unknown) => void;
}) {
  const [month, setMonth] = useState(() => monthStart(selected));
  const days = useDayTotals(month, monthEnd(month), today, onError);
  const current = monthStart(today);
  return (
    <>
      <SheetTitle className={kicker}>Tag wählen</SheetTitle>
      <div className="mt-1 mb-1 flex items-center justify-between">
        <button
          type="button"
          aria-label="Monat zurück"
          onClick={() => setMonth(monthStart(month, -1))}
          className="grid h-10 w-10 place-items-center text-muted-foreground"
        >
          <BackIcon />
        </button>
        <h2 className="font-heading text-[19px] font-bold">{monthTitle(month)}</h2>
        <button
          type="button"
          aria-label="Monat vor"
          disabled={month >= current}
          onClick={() => setMonth(monthStart(month, 1))}
          className="grid h-10 w-10 place-items-center text-muted-foreground disabled:opacity-30"
        >
          <ForwardIcon />
        </button>
      </div>
      <MonthCalendar month={month} today={today} selected={selected} days={days} onPick={onPick} />
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => onPick(today)} className="h-11 rounded-[13px] border text-sm font-semibold">
          Heute
        </button>
        <button
          type="button"
          onClick={() => onPick(addDays(today, -1))}
          className="h-11 rounded-[13px] border text-sm font-semibold"
        >
          Gestern
        </button>
      </div>
    </>
  );
}

"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getStats, type DayTotals, type Stats } from "@/lib/api";
import { daysFrom, period, type PeriodKind } from "@/lib/dates";
import { dayLabel, dayOfMonth, daysDative, fmt, percent, periodTitle, weekdayShort, WEEKDAYS_FROM_MONDAY } from "@/lib/format";
import { canStepBack, compareLine, goalLine, openingOffset, timeShares } from "@/lib/stats";
import { kicker } from "@/lib/styles";
import { DayRing, MonthCalendar, useDayTotals } from "@/components/calendar";
import { BARS } from "@/components/day-summary";
import { BackIcon, ForwardIcon } from "@/components/icons";
import { Segmented } from "@/components/segmented";
import { KcalChart } from "@/components/stats/kcal-chart";
import { StatsSkeleton, useDelayed } from "@/components/skeleton";
import { cn } from "@/lib/utils";

const TIMES = ["Morgens", "Mittags", "Nachmittags", "Abends"];

/** A section with its kicker and a line above, like the day summary and the diary. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-2 border-t py-[13px]">
      <span className={kicker}>{title}</span>
      {children}
    </section>
  );
}

/** A row of a horizontal bar: label, bar in the accent colour, value. */
function HBar({ label, share, value }: { label: string; share: number; value: string }) {
  return (
    <div className="grid grid-cols-[82px_1fr_46px] items-center gap-2 text-[12.5px] tabular-nums">
      <span>{label}</span>
      <div className="h-[7px] rounded-r-[4px] bg-tile">
        <i className="block h-full rounded-r-[4px] bg-primary" style={{ width: `${Math.min(share, 1) * 100}%` }} />
      </div>
      <span className="text-right text-muted-foreground">{value}</span>
    </div>
  );
}

/**
 * The tab Statistik (SPEC 3, ADR-0015): a week (Monday to Sunday) or a calendar month, this
 * week on opening and this month on switching (the one before on its first day, which has no
 * finished day yet). The answer comes first, the average per day against the goal; then kcal per
 * day, nutrients, logged days, weekdays (month only), times of day and the most frequent foods.
 * A tap on a day opens it on Heute. All numbers are the backend's.
 */
export function Statistics({
  today,
  onOpen,
  onError,
}: {
  today: string;
  onOpen: (date: string) => void;
  /** With `retry`, "Nochmal" asks again for the period shown. */
  onError: (failure: unknown, retry: () => void) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const fail = useCallback((failure: unknown) => onError(failure, () => setAttempt((n) => n + 1)), [onError]);
  const [kind, setKind] = useState<PeriodKind>("week");
  const [offset, setOffset] = useState(() => openingOffset("week", today));
  const [selected, setSelected] = useState<string | null>(null);
  const shown = period(kind, offset, today);
  const key = `${shown.from}/${shown.to}`;
  const [loaded, setLoaded] = useState<{ key: string; stats: Stats } | null>(null);
  useEffect(() => {
    let live = true;
    const [from, to] = key.split("/");
    getStats(from, to).then(
      (stats) => live && setLoaded({ key, stats }),
      (failure) => live && fail(failure),
    );
    return () => {
      live = false;
    };
  }, [key, fail, attempt]);
  const stats = loaded?.key === key ? loaded.stats : null;
  // While the next period loads, the last one stays dimmed instead of an empty page.
  const stale = stats === null && loaded !== null;
  const showing = stats ?? loaded?.stats ?? null;
  const loadingShown = useDelayed(loaded === null);
  const days = useDayTotals(shown.from, shown.to, today, fail, attempt);
  const title = periodTitle(shown);

  const step = (by: number) => {
    setOffset(offset + by);
    setSelected(null);
  };

  return (
    <div className="pb-2">
      <Segmented
        label="Zeitraum"
        options={[
          { value: "week", label: "Woche" },
          { value: "month", label: "Monat" },
        ]}
        value={kind}
        onChange={(value) => {
          setKind(value);
          setOffset(openingOffset(value, today));
          setSelected(null);
        }}
      />
      <div className="mt-1 flex items-center justify-between">
        <button
          type="button"
          aria-label="Zeitraum zurück"
          disabled={!canStepBack(showing?.first_day, shown.from)}
          onClick={() => step(-1)}
          className="grid h-10 w-10 place-items-center text-muted-foreground disabled:opacity-30"
        >
          <BackIcon />
        </button>
        <h2 className="text-center text-sm font-bold" aria-live="polite">
          {title.name}
          <small className="block text-[11.5px] font-medium text-muted-foreground">{title.range}</small>
        </h2>
        <button
          type="button"
          aria-label="Zeitraum vor"
          disabled={offset >= 0}
          onClick={() => step(1)}
          className="grid h-10 w-10 place-items-center text-muted-foreground disabled:opacity-30"
        >
          <ForwardIcon />
        </button>
      </div>

      {stats && (stats.days_logged === 0 || !stats.average || !stats.target_average) && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          In diesem Zeitraum gibt es noch keine abgeschlossenen Tage.
        </p>
      )}
      {loadingShown && <StatsSkeleton />}
      {showing?.average && showing.target_average && showing.days_logged > 0 && (
        <div aria-busy={stale || undefined} className={cn("transition-opacity duration-150", stale && "opacity-45")}>
        <Overview
          stats={showing as Stats & { average: NonNullable<Stats["average"]>; target_average: NonNullable<Stats["target_average"]> }}
          kind={kind}
          today={today}
          shown={shown}
          days={days}
          selected={selected}
          onSelect={setSelected}
          onOpen={onOpen}
        />
        </div>
      )}
    </div>
  );
}

function Overview({
  stats,
  kind,
  today,
  shown,
  days,
  selected,
  onSelect,
  onOpen,
}: {
  stats: Stats & { average: NonNullable<Stats["average"]>; target_average: NonNullable<Stats["target_average"]> };
  kind: PeriodKind;
  today: string;
  shown: ReturnType<typeof period>;
  days: Map<string, DayTotals>;
  selected: string | null;
  onSelect: (date: string | null) => void;
  onOpen: (date: string) => void;
}) {
  const { average, target_average: target } = stats;
  const compare = compareLine(average.kcal, stats.previous.average_kcal, kind);
  const weekdayMax = Math.max(1, ...stats.weekdays.map((value) => value ?? 0));
  const times = timeShares(stats.times_of_day);
  return (
    <>
      <section aria-label="Schnitt je Tag" className="mt-1.5 grid gap-1.5 border-t py-[13px]">
        <b className="font-heading text-[38px] leading-none font-extrabold tabular-nums">
          {fmt(average.kcal)}
          <small className="ml-1.5 font-sans text-sm font-medium text-muted-foreground">kcal je Tag</small>
        </b>
        <p className="text-[13.5px] leading-snug">
          {goalLine(average.kcal, target.kcal, stats.targets_vary)}
          {compare && ` ${compare}`}
        </p>
        <p className="text-[13.5px] leading-snug text-muted-foreground">
          {`Aus ${fmt(stats.days_logged)} von ${daysDative(stats.days_possible)}. An ${daysDative(stats.in_range.kcal)} im Zielbereich (±${percent(stats.tolerance)}).`}
          {/* The running day is in the chart but not in the numbers: said, not left to guess. */}
          {shown.from <= today && today <= shown.to && " Heute zählt ab morgen mit."}
        </p>
      </section>

      <Section title="Kalorien je Tag">
        <KcalChart
          period={shown}
          today={today}
          days={days}
          trailing={stats.trailing_kcal}
          selected={selected}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      </Section>

      <Section title="Nährstoffe im Schnitt">
        <div className="grid gap-2.5">
          {BARS.map(({ key, label, color }) => (
            <div key={key} data-testid={`average-${key}`}>
              <div className="mb-1 flex justify-between gap-1.5 text-[12.5px] tabular-nums">
                <span className="font-semibold">{label}</span>
                <span className="text-muted-foreground">
                  <b className="text-foreground">{fmt(average[key])}</b> / {fmt(target[key])} g
                </span>
              </div>
              {/* Up to 130 % of the goal, with a mark at the goal. */}
              <div className="relative h-[7px] rounded-[4px] border bg-surface-2">
                <i
                  className="block h-full rounded-[3px]"
                  style={{
                    width: `${target[key] > 0 ? Math.min((average[key] / (target[key] * 1.3)) * 100, 100) : 0}%`,
                    background: color,
                  }}
                />
                <u className="absolute -top-[3px] -bottom-[3px] left-[76.9%] w-0.5 rounded-[1px] bg-foreground" />
              </div>
              <div className="mt-[3px] text-[11.5px] text-muted-foreground">
                {`An ${fmt(stats.in_range[key])} von ${daysDative(stats.days_logged)} im Zielbereich`}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Erfasste Tage">
        {kind === "week" ? (
          <div className="grid grid-cols-7 justify-items-center">
            {daysFrom(shown.from, shown.to).map((date) => (
              <div key={date} className="grid justify-items-center text-[10.5px] text-muted-foreground">
                {weekdayShort(date)}
                {date > today ? (
                  <span className="size-[34px]" />
                ) : (
                  <button
                    type="button"
                    aria-label={`${dayLabel(date, today)} öffnen`}
                    onClick={() => onOpen(date)}
                    className="grid size-10 place-items-center text-[12.5px] font-semibold text-foreground"
                  >
                    <DayRing day={days.get(date)} size={34} text={dayOfMonth(date)} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <MonthCalendar month={shown.from} today={today} days={days} onPick={onOpen} />
        )}
      </Section>

      {kind === "month" && (
        <Section title="Nach Wochentag">
          {WEEKDAYS_FROM_MONDAY.map((weekday, i) => (
            <HBar
              key={weekday}
              label={weekday}
              share={(stats.weekdays[i] ?? 0) / weekdayMax}
              value={stats.weekdays[i] === null ? "–" : fmt(stats.weekdays[i] ?? 0)}
            />
          ))}
        </Section>
      )}

      <Section title="Nach Tageszeit">
        {TIMES.map((label, i) => (
          <HBar key={label} label={label} share={times[i]} value={percent(times[i])} />
        ))}
      </Section>

      {stats.top.length > 0 && (
        <Section title="Am häufigsten">
          {stats.top.map((item) => (
            <div
              key={`${item.kind}-${item.name}`}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 text-[13.5px] tabular-nums"
            >
              <span className="truncate font-medium">{item.name}</span>
              <span className="text-muted-foreground">{`${fmt(item.count)}×`}</span>
              <span className="text-muted-foreground">{`${fmt(item.kcal)} kcal`}</span>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

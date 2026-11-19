"use client";

import type { KeyboardEvent } from "react";
import type { DayTotals, Stats } from "@/lib/api";
import { daysFrom, type Period } from "@/lib/dates";
import { dayOfMonth, fmt, shortDay, weekdayShort } from "@/lib/format";
import { chartTop } from "@/lib/stats";
import { MacroLine } from "@/components/macro-line";

const W = 328;
const H = 158;
const LEFT = 34;
const RIGHT = 4;
const TOP = 10;
const BOTTOM = 20;

/**
 * Kalorien je Tag (SPEC 3): a bar per day with the dashed goal line, which steps where the
 * goal changed. A day without entries has no mark, the running day a dashed outline. In a month the bars are lighter and a line shows the average of the last 7 logged
 * days. Over the goal nothing turns red: the line shows where a day stands (ADR-0015).
 */
export function KcalChart({
  period,
  today,
  days,
  trailing,
  selected,
  onSelect,
  onOpen,
}: {
  period: Period;
  today: string;
  days: Map<string, DayTotals>;
  trailing: Stats["trailing_kcal"];
  selected: string | null;
  onSelect: (date: string | null) => void;
  /** "Öffnen" of the readout: that day on Heute. */
  onOpen: (date: string) => void;
}) {
  const dates = daysFrom(period.from, period.to);
  const week = period.kind === "week";
  const values = dates.map((date) => days.get(date)?.totals.kcal ?? 0);
  // A day still to come keeps the goal of the last known day.
  const goals: number[] = [];
  for (const date of dates) goals.push(days.get(date)?.targets.kcal ?? goals.at(-1) ?? 0);
  const lastGoal = goals.at(-1) ?? 0;

  const top = chartTop([...values, ...goals]);
  const band = (W - LEFT - RIGHT) / dates.length;
  const barWidth = week ? 24 : Math.max(3, band - 2);
  const y = (value: number) => TOP + (H - TOP - BOTTOM) * (1 - value / top);
  const base = y(0);
  const center = (i: number) => LEFT + band * i + band / 2;

  const grid = [];
  for (let value = 0; value <= top; value += 1000) grid.push(value);

  const goalPath = lastGoal
    ? goals
        .map((goal, i) => `${i ? "L" : "M"}${(LEFT + band * i).toFixed(1)} ${y(goal).toFixed(1)}H${(LEFT + band * (i + 1)).toFixed(1)}`)
        .join("")
    : "";
  const points = week
    ? []
    : trailing.flatMap(({ date, kcal }) => {
        const i = dates.indexOf(date);
        return i >= 0 && kcal !== null && date < today ? [`${center(i).toFixed(1)},${y(kcal).toFixed(1)}`] : [];
      });

  const toggle = (date: string) => onSelect(selected === date ? null : date);
  const key = (date: string) => (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle(date);
  };

  const shown = selected ? days.get(selected) : undefined;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Kalorien je Tag" className="block h-auto w-full overflow-visible">
        {grid.map((value) => (
          <g key={value}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(value)} y2={y(value)} stroke="var(--biss-line)" strokeWidth="1" />
            <text x={LEFT - 6} y={y(value) + 3.5} textAnchor="end" className="fill-muted-foreground text-[10.5px] tabular-nums">
              {fmt(value)}
            </text>
          </g>
        ))}
        {dates.map((date, i) => {
          if (date > today) return null;
          const x = LEFT + band * i + (band - barWidth) / 2;
          const value = values[i];
          const logged = (days.get(date)?.entries ?? 0) > 0 && value > 0;
          const r = Math.min(3, barWidth / 2);
          // A day without entries has no mark: a stroke read as "ate little" (its tap says "keine Einträge").
          if (!logged) return null;
          if (date === today) {
            return (
              <rect
                key={date}
                x={x + 0.5}
                y={y(value)}
                width={barWidth - 1}
                height={base - y(value)}
                rx={r}
                fill="none"
                stroke="var(--biss-muted)"
                strokeDasharray="3 2"
              />
            );
          }
          const on = selected === date;
          return (
            <path
              key={date}
              d={`M${x} ${base}V${y(value) + r}q0-${r} ${r}-${r}h${barWidth - 2 * r}q${r} 0 ${r} ${r}V${base}z`}
              fill={week || on ? "var(--biss-accent)" : "var(--biss-bar)"}
              opacity={week && selected && !on ? 0.4 : 1}
            />
          );
        })}
        {points.length > 1 && (
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="var(--biss-accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {goalPath && (
          <>
            <path d={goalPath} fill="none" stroke="var(--biss-ink)" strokeWidth="1.2" strokeDasharray="4 3" />
            <text
              x={W - RIGHT}
              y={y(lastGoal) - 4}
              textAnchor="end"
              className="fill-foreground text-[10.5px] tabular-nums"
              style={{ paintOrder: "stroke", stroke: "var(--biss-surface)", strokeWidth: 3 }}
            >
              {`Ziel ${fmt(lastGoal)}`}
            </text>
          </>
        )}
        {dates.map((date, i) =>
          week || (dayOfMonth(date) - 1) % 7 === 0 ? (
            <text key={date} x={center(i)} y={H - 5} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">
              {week ? weekdayShort(date) : `${dayOfMonth(date)}.`}
            </text>
          ) : null,
        )}
        {dates.map((date, i) =>
          date > today ? null : (
            <rect
              key={date}
              role="button"
              tabIndex={0}
              aria-pressed={selected === date}
              aria-label={`${shortDay(date)}: ${(days.get(date)?.entries ?? 0) > 0 ? `${fmt(values[i])} kcal` : "keine Einträge"}`}
              onClick={() => toggle(date)}
              onKeyDown={key(date)}
              x={LEFT + band * i}
              y={TOP}
              width={band}
              height={H - TOP}
              className="cursor-pointer fill-transparent outline-none focus-visible:fill-tile"
            />
          ),
        )}
      </svg>
      {!week && (
        <div className="flex gap-3 text-[11.5px] text-muted-foreground">
          <span>
            <i className="mr-1 inline-block h-2 w-3 rounded-[2px] bg-[var(--biss-bar)] align-middle" />
            Tag
          </span>
          <span>
            <i className="mr-1 inline-block h-[3px] w-3 rounded-[2px] bg-primary align-middle" />
            Schnitt der letzten 7 Tage
          </span>
        </div>
      )}
      <div className="flex min-h-9 items-center justify-between gap-2 text-[12.5px] text-muted-foreground tabular-nums">
        {selected ? (
          <>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
              <b className="font-semibold text-foreground">
                {shortDay(selected)}
                {selected === today && " (läuft)"}
              </b>
              {shown && shown.entries > 0 ? (
                <>
                  {`· ${fmt(shown.totals.kcal)} kcal ·`}
                  <MacroLine macros={shown.totals} />
                </>
              ) : (
                "· keine Einträge"
              )}
            </span>
            <button type="button" onClick={() => onOpen(selected)} className="flex-none py-1.5 pl-1.5 font-bold text-primary">
              Öffnen
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}

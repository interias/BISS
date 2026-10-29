"use client";

import { useState } from "react";
import type { DayGroup, Entry, Macros, Meal, MealEntries } from "@/lib/api";
import { clockTime, fmt, MEAL_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FoodPic } from "@/components/food-pic";

/** The Gericht (group) to remove, with what "Rückgängig" needs to log it again. */
export type GroupRemoval = { meal: Meal; group: DayGroup; entries: Entry[] };

function EntryRow({ entry, onOpen, nested }: { entry: Entry; onOpen: (entry: Entry) => void; nested?: boolean }) {
  return (
    <button
      type="button"
      data-entry-id={entry.id}
      onClick={() => onOpen(entry)}
      className={cn(
        "grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-px border-b border-dashed py-[9px] text-left last:border-b-0",
        nested && "pl-3",
      )}
    >
      <span className="row-span-2">
        <FoodPic size={nested ? 36 : 44} />
      </span>
      <span className="min-w-0 self-end truncate font-semibold">{entry.food.name}</span>
      <span className="self-end text-right font-bold tabular-nums">{fmt(entry.macros.kcal)}</span>
      <span className="col-[2/-1] min-w-0 self-start text-[12.5px] text-muted-foreground tabular-nums">
        {`${fmt(entry.grams)} g · ${clockTime(entry.eaten_at)} · E ${fmt(entry.macros.protein)} · K ${fmt(entry.macros.carbs)} · F ${fmt(entry.macros.fat)}`}
      </span>
    </button>
  );
}

const macroLine = (totals: Macros) =>
  `E ${fmt(totals.protein)} · K ${fmt(totals.carbs)} · F ${fmt(totals.fat)}`;

/**
 * A plate: one row with the sum from the backend, unfolds to its entries (SPEC 3). Without a
 * Schnellzugriff of its name it offers to remember it as one.
 */
function GroupRow({
  group,
  entries,
  onOpen,
  onRemove,
  onRemember,
}: {
  group: DayGroup;
  entries: Entry[];
  onOpen: (entry: Entry) => void;
  onRemove: () => void;
  onRemember?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-group-id={group.group_id} className="border-b border-dashed last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-px py-[9px] text-left"
      >
        <span className="row-span-2">
          <FoodPic size={44} />
        </span>
        <span className="min-w-0 self-end truncate font-semibold">{group.group_name}</span>
        <span className="self-end text-right font-bold tabular-nums">{fmt(group.totals.kcal)}</span>
        <span className="col-[2/-1] flex min-w-0 items-center justify-between gap-2 self-start text-[12.5px] text-muted-foreground tabular-nums">
          <span className="truncate">
            {`${group.entry_ids.length} Zutaten · ${clockTime(entries[0].eaten_at)} · ${macroLine(group.totals)}`}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            aria-hidden="true"
            className={cn("flex-none transition-transform", open && "rotate-180")}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {onRemember && (
        <button
          type="button"
          onClick={onRemember}
          className="-mt-1.5 mb-2 ml-14 text-[12px] font-bold text-primary"
        >
          als Schnellzugriff merken
        </button>
      )}
      {open && (
        <div className="pb-2">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onOpen={onOpen} nested />
          ))}
          <button
            type="button"
            onClick={onRemove}
            className="mt-1 h-9 w-full rounded-xl border text-[13px] font-semibold text-muted-foreground"
          >
            Gericht entfernen
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The rows of a meal in time order: the entries of a Gericht stand in their group, at the
 * place of the group's first entry.
 */
type Row = { entry: Entry } | { group: DayGroup; members: Entry[] };

function mealRows({ entries, groups }: MealEntries): Row[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const grouped = new Set(groups.flatMap((group) => group.entry_ids));
  return entries.flatMap((entry): Row[] => {
    if (!grouped.has(entry.id)) return [{ entry }];
    const group = groups.find((g) => g.entry_ids[0] === entry.id);
    if (!group) return [];
    return [{ group, members: group.entry_ids.map((id) => byId.get(id)!) }];
  });
}

/**
 * Diary by meal; a tap on an entry opens it for editing, a Gericht shows as a group with its
 * sum that unfolds and can be removed. A group whose name no Schnellzugriff has (`comboNames`)
 * can be remembered as one.
 */
export function Diary({
  meals,
  comboNames,
  onOpen,
  onRemoveGroup,
  onRemember,
}: {
  meals: MealEntries[];
  comboNames: string[];
  onOpen: (entry: Entry) => void;
  onRemoveGroup: (removal: GroupRemoval) => void;
  onRemember: (group: DayGroup) => void;
}) {
  return (
    <section aria-label="Tagebuch">
      {meals.map((mealEntries) => {
        const { meal, totals, entries } = mealEntries;
        return (
          <div key={meal} className="pt-4" data-meal={meal}>
            <h3 className="mb-1 flex justify-between text-[11px] font-bold tracking-[.12em] text-muted-foreground uppercase">
              <span>{MEAL_LABELS[meal]}</span>
              <span className="tabular-nums">{entries.length ? `${fmt(totals.kcal)} kcal` : ""}</span>
            </h3>
            {entries.length ? (
              mealRows(mealEntries).map((row) =>
                "group" in row ? (
                  <GroupRow
                    key={row.group.group_id}
                    group={row.group}
                    entries={row.members}
                    onOpen={onOpen}
                    onRemove={() => onRemoveGroup({ meal, group: row.group, entries: row.members })}
                    onRemember={
                      comboNames.includes(row.group.group_name) ? undefined : () => onRemember(row.group)
                    }
                  />
                ) : (
                  <EntryRow key={row.entry.id} entry={row.entry} onOpen={onOpen} />
                ),
              )
            ) : (
              <div className="py-2 text-[13px] text-muted-foreground">Noch nichts eingetragen</div>
            )}
          </div>
        );
      })}
    </section>
  );
}

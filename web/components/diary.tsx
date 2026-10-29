"use client";

import { useState } from "react";
import type { DayGroupRow, DayRow, Entry, Macros } from "@/lib/api";
import { clockTime, fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FoodPic } from "@/components/food-pic";


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
  onOpen,
  onRemove,
  onRemember,
}: {
  group: DayGroupRow;
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
            {`${group.entries.length} Zutaten · ${clockTime(group.eaten_at)} · ${macroLine(group.totals)}`}
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
          {group.entries.map((entry) => (
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
 * The diary: one list newest first as the backend orders it (ADR-0003), each row with its
 * clock time. A tap on an entry opens it for editing, a Gericht shows as a group with its sum
 * that unfolds and can be removed. A group whose name no Schnellzugriff has (`comboNames`)
 * can be remembered as one. Meals are not shown.
 */
export function Diary({
  rows,
  comboNames,
  onOpen,
  onRemoveGroup,
  onRemember,
}: {
  rows: DayRow[];
  comboNames: string[];
  onOpen: (entry: Entry) => void;
  onRemoveGroup: (group: DayGroupRow) => void;
  onRemember: (group: DayGroupRow) => void;
}) {
  return (
    <section aria-label="Tagebuch" className="pt-4">
      {rows.length ? (
        rows.map((row) =>
          row.kind === "group" ? (
            <GroupRow
              key={row.group_id}
              group={row}
              onOpen={onOpen}
              onRemove={() => onRemoveGroup(row)}
              onRemember={comboNames.includes(row.group_name) ? undefined : () => onRemember(row)}
            />
          ) : (
            <EntryRow key={row.entry.id} entry={row.entry} onOpen={onOpen} />
          ),
        )
      ) : (
        <div className="py-2 text-[13px] text-muted-foreground">Noch nichts eingetragen</div>
      )}
    </section>
  );
}

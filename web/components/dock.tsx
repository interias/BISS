"use client";

import { useRef, type MouseEvent } from "react";
import { kindColor, photoOf, type Chip, type Combo, type FoodSummary } from "@/lib/api";
import { previewMacros } from "@/lib/amount";
import { clip, fmt, fmtGrams, shortName } from "@/lib/format";
import { iconPill } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ai-mark";
import { FoodPic } from "@/components/food-pic";

/** A press this long opens the Schnellzugriff instead of logging it (SPEC 3). */
export const HOLD_MS = 500;

/** A chip gives way under the finger at once, before the backend answers. */
const CHIP_PRESS = "transition-[transform,opacity] duration-150 active:scale-[.96]";

/** The two lines of a chip: the name, below it grams and kcal. */
function ChipText({ name, grams, kcal, color }: { name: string; grams: number; kcal: number; color?: string }) {
  return (
    <span className="grid leading-tight">
      <span className={cn("text-[13px] font-semibold", color)}>{name}</span>
      <small className="text-[11px] font-medium text-muted-foreground tabular-nums">
        {`${fmtGrams(grams)} g · ${fmt(kcal)} kcal`}
      </small>
    </span>
  );
}

/** Two stacked squares mark a combination (prototype): on its chip and on the button for a new one. */
function ComboMark() {
  return (
    <span aria-hidden="true" className="relative size-[11px] flex-none">
      <i className="absolute top-0 right-0 size-[8px] rounded-[2px] border-[1.5px] border-primary" />
      <i className="absolute bottom-0 left-0 size-[8px] rounded-[2px] bg-primary" />
    </span>
  );
}

/**
 * A Schnellzugriff chip: a tap logs it, a long press or the context menu opens it. The click
 * that ends a long press does nothing; a click from the keyboard always logs.
 */
function ComboChip({
  combo,
  pending,
  onTap,
  onHold,
}: {
  combo: Combo;
  pending: boolean;
  onTap: () => void;
  onHold: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `pressing` while the pointer is down; `held` once that press opened the combo.
  const pressing = useRef(false);
  const held = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const release = () => {
    pressing.current = false;
    clear();
  };
  const hold = () => {
    clear();
    // On a phone the long press also brings the context menu: the press opens it once.
    if (held.current && pressing.current) return;
    held.current = true;
    onHold();
  };
  const click = (event: MouseEvent) => {
    if (held.current && event.detail !== 0) {
      held.current = false;
      return;
    }
    onTap();
  };
  const grams = combo.items.reduce((sum, item) => sum + item.grams, 0);
  return (
    <button
      type="button"
      aria-label={`Schnellzugriff ${combo.name}`}
      title={combo.name}
      data-combo-id={combo.id}
      onPointerDown={() => {
        pressing.current = true;
        held.current = false;
        clear();
        timer.current = setTimeout(hold, HOLD_MS);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(event) => {
        event.preventDefault();
        hold();
      }}
      onClick={click}
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex flex-none items-center gap-2 rounded-full border border-transparent bg-accent py-[4px] pr-3.5 pl-3 text-left whitespace-nowrap select-none [-webkit-touch-callout:none]",
        CHIP_PRESS,
        pending && "opacity-60",
      )}
    >
      <ComboMark />
      <ChipText name={clip(combo.name)} grams={grams} kcal={combo.totals.kcal} />
    </button>
  );
}

/**
 * Dock: the button for a new Schnellzugriff (a plus with the mark of its chips) first so it
 * never needs scrolling, then the Schnellzugriff and recent chips in the order of the backend
 * (the latest used first), the search field and the microphone at its right end. The camera
 * stands in the bar below (ADR-0015).
 */
export function Dock({
  chips,
  pending = null,
  onCombo,
  onComboHold,
  onNewCombo,
  onRecent,
  onSearch,
  onDictate,
}: {
  chips: Chip[];
  /** The key (`combo-<id>`, `food-<id>`) of the chip whose entry is on its way. */
  pending?: string | null;
  onCombo: (combo: Combo) => void;
  onComboHold: (combo: Combo) => void;
  onNewCombo: () => void;
  onRecent: (food: FoodSummary) => void;
  onSearch: () => void;
  /** Without speech recognition in the browser there is no microphone (ADR-0013). */
  onDictate?: () => void;
}) {
  return (
    <div className="border-t bg-card px-5 pt-2.5 pb-3">
      <div
        role="group"
        aria-label="Zuletzt gegessen"
        className="biss-no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pt-0.5 pb-2.5"
      >
        <button
          type="button"
          aria-label="Neuer Schnellzugriff"
          title="Neuer Schnellzugriff"
          onClick={onNewCombo}
          className={iconPill}
        >
          {/* A plus and the mark of the Schnellzugriff chips: a new one of those. */}
          +
          <ComboMark />
        </button>
        {chips.map(({ combo, food }) => {
          if (combo) {
            return (
              <ComboChip
                key={`combo-${combo.id}`}
                combo={combo}
                pending={pending === `combo-${combo.id}`}
                onTap={() => onCombo(combo)}
                onHold={() => onComboHold(combo)}
              />
            );
          }
          const name = shortName(food.name);
          const grams = food.standard_serving.grams;
          return (
            <button
              key={`food-${food.id}`}
              type="button"
              aria-label={`${name} ${fmtGrams(grams)} g`}
              title={food.name}
              onClick={() => onRecent(food)}
              aria-busy={pending === `food-${food.id}` || undefined}
              // An own recipe in the accent colour, a scanned product in turquoise, as in the search.
              className={cn(
                "inline-flex flex-none items-center gap-1.5 rounded-full border bg-surface-2 py-[4px] pr-3 pl-[4px] text-left whitespace-nowrap",
                CHIP_PRESS,
                pending === `food-${food.id}` && "opacity-60",
                food.recipe ? "border-primary" : food.scanned && "border-scan",
              )}
            >
              <FoodPic size={26} round src={photoOf(food)} category={food.category} />
              <ChipText
                color={kindColor(food)}
                name={clip(name)}
                grams={grams}
                kcal={previewMacros(food.per_100, grams, food.basis, food.density).kcal}
              />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSearch}
          // A closed sheet whose opener is gone hands the focus here (Sheet).
          data-sheet-home
          className="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl border bg-surface-2 px-4 text-left font-medium text-muted-foreground"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="flex-none">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          {/* With the microphone beside it the field is narrow: one line, cut with "…". */}
          <span className="truncate">Lebensmittel suchen</span>
        </button>
        {onDictate && (
          <button
            type="button"
            aria-label="Mahlzeit diktieren"
            onClick={onDictate}
            className="relative grid size-[52px] flex-none place-items-center rounded-2xl border border-primary text-primary active:scale-[.96]"
          >
            {/* The sentence goes to a language model. */}
            <AiMark size={12} className="absolute top-1.5 right-1.5" />
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

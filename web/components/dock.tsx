"use client";

import { useRef, type MouseEvent } from "react";
import type { Combo, FoodSummary } from "@/lib/api";
import { previewMacros } from "@/lib/amount";
import { clip, fmt, shortName } from "@/lib/format";
import { FoodPic } from "@/components/food-pic";

/** A press this long opens the Schnellzugriff instead of logging it (SPEC 3). */
export const HOLD_MS = 500;

/** The two lines of a chip: the name, below it grams and kcal. */
function ChipText({ name, grams, kcal }: { name: string; grams: number; kcal: number }) {
  return (
    <span className="grid leading-tight">
      <span className="text-[13px] font-semibold">{name}</span>
      <small className="text-[11px] font-medium text-muted-foreground tabular-nums">
        {`${fmt(grams)} g · ${fmt(kcal)} kcal`}
      </small>
    </span>
  );
}

/**
 * A Schnellzugriff chip: a tap logs it, a long press or the context menu opens it. The click
 * that ends a long press does nothing; a click from the keyboard always logs.
 */
function ComboChip({ combo, onTap, onHold }: { combo: Combo; onTap: () => void; onHold: () => void }) {
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
      className="inline-flex flex-none items-center gap-2 rounded-full border border-transparent bg-accent py-[4px] pr-3.5 pl-3 text-left whitespace-nowrap select-none [-webkit-touch-callout:none]"
    >
      {/* Two stacked squares mark a combination (prototype). */}
      <span aria-hidden="true" className="relative size-[11px] flex-none">
        <i className="absolute top-0 right-0 size-[8px] rounded-[2px] border-[1.5px] border-primary" />
        <i className="absolute bottom-0 left-0 size-[8px] rounded-[2px] bg-primary" />
      </span>
      <ChipText name={clip(combo.name)} grams={grams} kcal={combo.totals.kcal} />
    </button>
  );
}

/**
 * Dock: "+ Neu" first so it never needs scrolling, then the Schnellzugriff and recent chips,
 * search field and the camera button.
 */
export function Dock({
  combos,
  recent,
  onCombo,
  onComboHold,
  onNewCombo,
  onRecent,
  onSearch,
  onCamera,
}: {
  combos: Combo[];
  recent: FoodSummary[];
  onCombo: (combo: Combo) => void;
  onComboHold: (combo: Combo) => void;
  onNewCombo: () => void;
  onRecent: (food: FoodSummary) => void;
  onSearch: () => void;
  onCamera: () => void;
}) {
  return (
    <div className="border-t bg-card px-4 pt-2.5 pb-[calc(14px+env(safe-area-inset-bottom,0px))]">
      <div
        role="group"
        aria-label="Zuletzt gegessen"
        className="biss-no-scrollbar flex gap-2 overflow-x-auto px-0.5 pt-0.5 pb-2.5"
      >
        <button
          type="button"
          aria-label="Neuer Schnellzugriff"
          onClick={onNewCombo}
          className="inline-flex flex-none items-center rounded-full border border-dashed border-primary px-3 py-[5px] text-[13px] leading-[26px] font-semibold whitespace-nowrap text-primary"
        >
          + Neu
        </button>
        {combos.map((combo) => (
          <ComboChip key={combo.id} combo={combo} onTap={() => onCombo(combo)} onHold={() => onComboHold(combo)} />
        ))}
        {recent.map((food) => {
          const name = shortName(food.name);
          const grams = food.standard_serving.grams;
          return (
            <button
              key={food.id}
              type="button"
              aria-label={`${name} ${fmt(grams)} g`}
              title={food.name}
              onClick={() => onRecent(food)}
              className="inline-flex flex-none items-center gap-1.5 rounded-full border bg-surface-2 py-[4px] pr-3 pl-[4px] text-left whitespace-nowrap"
            >
              <FoodPic size={26} round />
              <ChipText
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
          className="flex h-[52px] flex-1 items-center gap-2.5 rounded-2xl border bg-surface-2 px-4 text-left font-medium text-muted-foreground"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Lebensmittel suchen
        </button>
        <button
          type="button"
          aria-label="Kamera: Barcode, Etikett oder Teller"
          onClick={onCamera}
          className="grid size-16 flex-none place-items-center rounded-[22px] bg-primary text-primary-foreground shadow-[0_8px_18px_-8px_var(--biss-accent)] active:scale-[.96]"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

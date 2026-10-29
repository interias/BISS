"use client";

import { MIN_GRAMS, stepDown, stepUp } from "@/lib/amount";
import { cn } from "@/lib/utils";

/** The plate and Schnellzugriff sheets keep an ingredient within the rules (SPEC 7a). */
export const MAX_GRAMS = 1500;
export const clampGrams = (grams: number, max = MAX_GRAMS) =>
  Math.min(max, Math.max(MIN_GRAMS, Math.round(grams) || MIN_GRAMS));

/**
 * Grams with − and + on the step grid (lib/amount) and a typed value, clamped to 1 g up to
 * `max` when the field is left. `name` labels the controls of an ingredient ("Reis weniger",
 * "Reis Gramm"); without it they are "weniger", "mehr" and "Menge". `large` is the big
 * number of the amount sheet, where a single entry has no upper limit.
 */
export function IngredientGrams({
  name,
  grams,
  onChange,
  max = MAX_GRAMS,
  large = false,
}: {
  name?: string;
  grams: number;
  onChange: (grams: number) => void;
  max?: number;
  large?: boolean;
}) {
  const label = (text: string) => (name ? `${name} ${text}` : text);
  const button = large
    ? "size-12 rounded-[14px] border bg-surface-2 text-[22px] font-semibold"
    : "size-[30px] rounded-[9px] border bg-surface-2 font-bold";
  return (
    <span className={cn("flex items-center", large ? "mt-1 mb-3.5 justify-center gap-[18px]" : "gap-1.5")}>
      <button type="button" aria-label={label("weniger")} onClick={() => onChange(stepDown(grams))} className={button}>
        −
      </button>
      <label
        className={cn(
          "flex items-baseline justify-center tabular-nums",
          large ? "min-w-[150px] font-heading text-[44px] font-extrabold" : "min-w-[50px] font-bold",
        )}
      >
        <input
          type="number"
          inputMode="numeric"
          min={MIN_GRAMS}
          max={Number.isFinite(max) ? max : undefined}
          aria-label={name ? `${name} Gramm` : "Menge"}
          value={grams || ""}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          // An ingredient keeps whole grams; a serving of 12.5 g in the amount sheet stays.
          onBlur={() =>
            onChange(large ? Math.min(max, Math.max(MIN_GRAMS, grams || MIN_GRAMS)) : clampGrams(grams, max))
          }
          // The big number is as wide as its digits, so "g" stays next to it.
          style={large ? { width: `${Math.max(1, String(grams || "").length)}ch` } : undefined}
          className={cn(
            "[appearance:textfield] border-0 bg-transparent p-0 text-right outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-inner-spin-button]:appearance-none",
            large ? "text-center font-extrabold" : "w-[3.2ch] font-bold",
          )}
        />
        {large ? <small className="ml-0.5 text-xl font-bold text-muted-foreground">g</small> : <>&nbsp;g</>}
      </label>
      <button type="button" aria-label={label("mehr")} onClick={() => onChange(stepUp(grams, max))} className={button}>
        +
      </button>
    </span>
  );
}

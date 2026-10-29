"use client";

/** The − and + buttons: 10 g, never below 5 g (prototype); typed grams stay within the rules. */
const STEP = 10;
export const MIN_GRAMS = 5;
export const MAX_GRAMS = 1500;
export const clampGrams = (grams: number) =>
  Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, Math.round(grams) || MIN_GRAMS));

/**
 * Grams of an ingredient in the plate and Schnellzugriff sheets: − and + by 10 g and a typed
 * value, clamped to 5–1500 g when the field is left. `name` labels the controls.
 */
export function IngredientGrams({
  name,
  grams,
  onChange,
}: {
  name: string;
  grams: number;
  onChange: (grams: number) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${name} weniger`}
        onClick={() => onChange(Math.max(MIN_GRAMS, grams - STEP))}
        className="size-[30px] rounded-[9px] border bg-surface-2 font-bold"
      >
        −
      </button>
      <label className="flex min-w-[50px] items-baseline justify-center font-bold tabular-nums">
        <input
          type="number"
          inputMode="numeric"
          min={MIN_GRAMS}
          max={MAX_GRAMS}
          aria-label={`${name} Gramm`}
          value={grams || ""}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          onBlur={() => onChange(clampGrams(grams))}
          className="w-[3.2ch] [appearance:textfield] border-0 bg-transparent p-0 text-right font-bold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-inner-spin-button]:appearance-none"
        />
        &nbsp;g
      </label>
      <button
        type="button"
        aria-label={`${name} mehr`}
        onClick={() => onChange(grams + STEP)}
        className="size-[30px] rounded-[9px] border bg-surface-2 font-bold"
      >
        +
      </button>
    </span>
  );
}

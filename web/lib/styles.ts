/** Class names shared by the sheets, so the same thing looks the same everywhere. */

/** The small label above a sheet or a section: capitals, spaced. */
export const kicker = "text-[11px] font-bold tracking-[.12em] text-muted-foreground uppercase";

/** "Add something new": a dashed pill in the accent colour, like "+ Neu" in the dock. */
export const addPill =
  "inline-flex flex-none items-center justify-center gap-1.5 rounded-full border border-dashed border-primary px-3 py-[7px] text-[13px] font-semibold whitespace-nowrap text-primary";

/** A suggested ingredient: one line that ends in "…" rather than leaving the sheet. */
export const suggestChip =
  "max-w-full truncate rounded-full border bg-surface-2 px-3 py-[7px] text-[13px] font-semibold";

/** A small control answers on about 40 px without looking bigger. */
export const hitArea = "relative after:absolute after:-inset-[5px] after:content-['']";

/** A primary button that cannot be used yet: plain grey, readable in light and dark. */
export const primaryOff = "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

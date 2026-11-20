import type { Macros } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DOTS } from "@/components/amount-sheet";

/**
 * Protein, carbs and fat in one short line, the same in every list: always in this order,
 * each in its colour of the day summary ("E 11 K 4 F 0"). They count for the amount the
 * kcal beside them count for.
 */
/**
 * The line in the right column of a list row (picture, name, kcal; subtitle, macros). On a
 * narrow screen (zoom) it moves under the subtitle, so the name keeps its room.
 */
export const ROW_MACROS = "self-start max-[340px]:col-[2/-1] max-[340px]:justify-self-start";

export function MacroLine({ macros, className }: { macros: Macros; className?: string }) {
  return (
    <span data-testid="macros" className={cn("flex flex-none gap-2 text-[12.5px] font-bold tabular-nums", className)}>
      {DOTS.map(({ key, label, color }) => (
        <span key={key} title={label} style={{ color }}>
          {label[0]} {fmt(macros[key])}
        </span>
      ))}
    </span>
  );
}

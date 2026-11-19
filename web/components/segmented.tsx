import { cn } from "@/lib/utils";

/**
 * One of a few values (Woche/Monat, Toleranz): the single building block for that choice
 * (docs/design/einheitlichkeit.md). The pressed segment stands raised on the surface.
 */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid rounded-xl bg-tile p-[3px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => option.value !== value && onChange(option.value)}
          className={cn(
            "h-[34px] rounded-[9px] text-[13.5px] font-semibold text-muted-foreground tabular-nums",
            option.value === value && "bg-card text-foreground shadow-[0_1px_3px_var(--biss-shadow)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

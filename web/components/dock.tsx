import type { FoodSummary } from "@/lib/api";
import { fmt, shortName } from "@/lib/format";
import { FoodPic } from "@/components/food-pic";

/** Dock: recent chips, search field and the camera button. */
export function Dock({
  recent,
  onRecent,
  onSearch,
  onCamera,
}: {
  recent: FoodSummary[];
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
        {recent.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => onRecent(food)}
            className="inline-flex flex-none items-center gap-1.5 rounded-full border bg-surface-2 py-[5px] pr-3 pl-[5px] text-[13px] font-semibold whitespace-nowrap"
          >
            <FoodPic size={26} round />
            {shortName(food.name)}
            <small className="font-medium text-muted-foreground tabular-nums">
              {fmt(food.standard_serving.grams)} g
            </small>
          </button>
        ))}
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

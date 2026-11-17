/**
 * "Zutat suchen" as one field, like the search in the dock: the recipe and Schnellzugriff
 * sheets add ingredients through it; recent foods as chips were seldom ingredients there.
 */
export function IngredientSearchField({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 mb-4 flex h-[46px] w-full items-center gap-2.5 rounded-xl border bg-surface-2 px-3.5 text-left font-medium text-muted-foreground"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="flex-none">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      Zutat suchen
    </button>
  );
}

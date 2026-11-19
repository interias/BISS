import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BarsIcon, BookIcon, CameraIcon, DayIcon, GearIcon } from "@/components/icons";

export type Tab = "today" | "recipes" | "stats" | "settings";

function TabButton({
  tab,
  current,
  label,
  icon,
  onTab,
}: {
  tab: Tab;
  current: Tab;
  label: string;
  icon: ReactNode;
  onTab: (tab: Tab) => void;
}) {
  const active = tab === current;
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => onTab(tab)}
      className={cn(
        "grid content-center justify-items-center gap-px text-[10.5px] font-medium whitespace-nowrap text-muted-foreground",
        active && "font-bold text-foreground",
      )}
    >
      <span className={cn("grid h-[25px] w-11 place-items-center rounded-full", active && "bg-accent text-primary")}>
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * The bar under the dock (ADR-0015): Heute, Rezepte, the raised camera in the middle,
 * Statistik and Einstellungen. The active tab has a pill in the accent colour.
 */
export function NavBar({ tab, onTab, onCamera }: { tab: Tab; onTab: (tab: Tab) => void; onCamera: () => void }) {
  return (
    <nav
      aria-label="Bereiche"
      className="grid h-[calc(58px+env(safe-area-inset-bottom,0px))] flex-none grid-cols-[1fr_1fr_70px_1fr_1fr] border-t bg-card pb-[env(safe-area-inset-bottom,0px)]"
    >
      <TabButton tab="today" current={tab} label="Heute" icon={<DayIcon />} onTab={onTab} />
      <TabButton tab="recipes" current={tab} label="Rezepte" icon={<BookIcon />} onTab={onTab} />
      <button
        type="button"
        aria-label="Kamera: Barcode, Etikett oder Teller"
        onClick={onCamera}
        className="-mt-[18px] grid size-16 place-items-center self-start justify-self-center rounded-[22px] border-4 border-card bg-primary bg-clip-padding text-primary-foreground shadow-[0_8px_18px_-8px_var(--biss-accent)] active:scale-[.96]"
      >
        <CameraIcon />
      </button>
      <TabButton tab="stats" current={tab} label="Statistik" icon={<BarsIcon />} onTab={onTab} />
      <TabButton tab="settings" current={tab} label="Einstellungen" icon={<GearIcon />} onTab={onTab} />
    </nav>
  );
}

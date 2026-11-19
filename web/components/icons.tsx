import type { ReactNode } from "react";

/** Line symbols like those of the dock: 2 px stroke, round ends (docs/design/einheitlichkeit.md). */
function Line({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const BackIcon = () => (
  <Line>
    <path d="m15 5-7 7 7 7" />
  </Line>
);

export const ForwardIcon = () => (
  <Line>
    <path d="m9 5 7 7-7 7" />
  </Line>
);

/** Heute: a clock face with the day's arc. */
export const DayIcon = () => (
  <Line>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 8 8" />
    <path d="M12 8v4l2.5 2" />
  </Line>
);

/** Rezepte: the open cookbook that stood in the dock. */
export const BookIcon = () => (
  <Line>
    <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Z" />
    <path d="M12 6.5V19.5" />
  </Line>
);

export const BarsIcon = () => (
  <Line>
    <path d="M6 20v-7M12 20V5M18 20v-10" />
  </Line>
);

export const GearIcon = () => (
  <Line>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </Line>
);

export const CameraIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.6" />
  </svg>
);

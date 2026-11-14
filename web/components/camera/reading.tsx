"use client";

import { useEffect, useState, type ReactNode } from "react";

/** How long one quip stays. */
export const QUIP_MS = 2000;

const QUIPS = {
  plate: [
    "Zähle Erbsen",
    "Wiege die Nudeln im Kopf",
    "Frage die Kartoffel nach ihrem Gewicht",
    "Schätze die Soße",
    "Suche versteckten Käse",
    "Verhandle mit dem Salat",
    "Messe den Tellerrand",
    "Sortiere die Beilagen",
    "Zähle Reiskörner",
    "Halte die Gabel still",
    "Befrage die Brokkoli-Röschen",
    "Kalorien verstecken sich gern",
    "Prüfe auf Nachschlag",
    "Schaue unter das Salatblatt",
    "Rieche am Foto",
  ],
  label: [
    "Entziffere das Kleingedruckte",
    "Suche die Kalorien",
    "Lese zwischen den Zeilen",
    "Zähle die Nachkommastellen",
    "Rechne kJ in kcal",
    "Frage die Packung aus",
    "Suche das Salz",
    "Halte das Etikett gerade",
  ],
};

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" } as const;
const ACCENT = "var(--biss-accent)";

// One of them shows per photo, for a change. The motion is in globals.css (biss-load-*).
const ANIMATIONS: ReactNode[] = [
  // A plate whose rim is counted round and round, like the calorie ring.
  <svg key="plate" viewBox="0 0 120 96">
    <circle cx="60" cy="48" r="34" {...STROKE} opacity="0.25" />
    <circle cx="60" cy="48" r="34" {...STROKE} stroke={ACCENT} strokeDasharray="6 9" className="biss-load-spin" />
    <circle cx="60" cy="48" r="20" {...STROKE} opacity="0.5" />
  </svg>,
  // A bowl that steams.
  <svg key="bowl" viewBox="0 0 120 96">
    {[44, 60, 76].map((x, index) => (
      <path
        key={x}
        d={`M${x} 40c-5-6 5-10 0-16`}
        {...STROKE}
        stroke={ACCENT}
        className="biss-load-steam"
        style={{ animationDelay: `${index * 0.3}s` }}
      />
    ))}
    <path d="M26 52h68c0 18-14 30-34 30S26 70 26 52Z" {...STROKE} />
  </svg>,
  // The cookie of the logo, bitten three times.
  <svg key="cookie" viewBox="0 0 120 96">
    <circle cx="60" cy="48" r="32" fill={ACCENT} />
    <circle cx="50" cy="40" r="4" fill="var(--biss-cam)" opacity="0.5" />
    <circle cx="66" cy="58" r="5" fill="var(--biss-cam)" opacity="0.5" />
    <circle cx="48" cy="60" r="3" fill="var(--biss-cam)" opacity="0.5" />
    {[
      [88, 30],
      [94, 50],
      [84, 70],
    ].map(([cx, cy], index) => (
      <circle
        key={cy}
        cx={cx}
        cy={cy}
        r="13"
        fill="var(--biss-cam)"
        className="biss-load-bite"
        style={{ animationDelay: `${index * 0.45}s` }}
      />
    ))}
  </svg>,
  // A kitchen scale whose needle cannot decide.
  <svg key="scale" viewBox="0 0 120 96">
    <path d="M24 72a36 36 0 0 1 72 0" {...STROKE} opacity="0.5" />
    <path d="M24 72h72" {...STROKE} />
    <line x1="60" y1="72" x2="60" y2="42" {...STROKE} stroke={ACCENT} className="biss-load-swing" />
    <circle cx="60" cy="72" r="4" fill="currentColor" />
  </svg>,
];

const other = (previous: number, length: number) =>
  length < 2 ? previous : (previous + 1 + Math.floor(Math.random() * (length - 1))) % length;

/**
 * Covers the camera picture while the backend reads a photo: one of four animations, chosen
 * per photo, and a short quip that changes every two seconds. The status line below the
 * picture says what is going on; this is only for the wait, so it is hidden from readers.
 */
export function Reading({ kind }: { kind: keyof typeof QUIPS }) {
  const quips = QUIPS[kind];
  const [animation] = useState(() => Math.floor(Math.random() * ANIMATIONS.length));
  const [quip, setQuip] = useState(() => Math.floor(Math.random() * quips.length));

  useEffect(() => {
    const timer = setInterval(() => setQuip((previous) => other(previous, quips.length)), QUIP_MS);
    return () => clearInterval(timer);
  }, [quips.length]);

  return (
    <div
      aria-hidden="true"
      data-testid="reading"
      className="absolute inset-0 grid place-content-center justify-items-center gap-5 bg-cam px-6 text-center"
    >
      <div className="h-[120px] [&>svg]:h-full [&>svg]:w-auto">{ANIMATIONS[animation]}</div>
      <p key={quip} data-testid="quip" className="biss-load-quip min-h-[2.6em] text-[15px] font-semibold">
        {quips[quip]} …
      </p>
    </div>
  );
}

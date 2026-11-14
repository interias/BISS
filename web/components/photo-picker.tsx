"use client";

import { useRef, type ChangeEvent } from "react";
import type { Category } from "@/lib/api";
import { FoodPic } from "@/components/food-pic";

const chip =
  "inline-flex h-7 items-center gap-1 rounded-full border bg-surface-2 px-2.5 text-[11.5px] font-bold text-foreground";

/**
 * The photo of a food or recipe with the ways to set it: a tap on the picture or on
 * "Galerie" chooses one, "Kamera" takes one. The picture shows the centred square the
 * backend keeps, so what is seen here is what is stored. The plus on the picture says it
 * can be tapped.
 */
export function PhotoPicker({
  src,
  category,
  size = 96,
  label = "Foto aufnehmen oder wählen",
  onPick,
}: {
  label?: string;
  src: string | null;
  category: Category | null;
  size?: number;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  return (
    <div className="grid justify-items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        onClick={() => gallery.current?.click()}
        className="relative"
      >
        <FoodPic size={size} src={src} category={category} />
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -bottom-1.5 grid size-[26px] place-items-center rounded-full bg-primary text-[18px] leading-none font-bold text-primary-foreground shadow-[0_2px_6px_var(--biss-shadow)]"
        >
          +
        </span>
      </button>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => camera.current?.click()} className={chip}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.6" />
          </svg>
          Kamera
        </button>
        <button type="button" onClick={() => gallery.current?.click()} className={chip}>
          Galerie
        </button>
      </div>
      <input ref={gallery} type="file" accept="image/*" hidden data-testid="photo-gallery" onChange={onPick} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden data-testid="photo-camera" onChange={onPick} />
    </div>
  );
}

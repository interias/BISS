"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ApiError, extractLabel, scanBarcode, type BarcodeFood, type LabelExtraction } from "@/lib/api";
import { cn } from "@/lib/utils";
import { cameraAvailable, captureFrame, decodeImage, scanLive } from "@/components/camera/scanner";

/** How long the green frame shows before the amount sheet opens (prototype). */
export const HIT_DELAY_MS = 450;
/** After a failed lookup the same code in the live picture is tried again this much later. */
export const RETRY_MS = 1500;

// Without camera access or a secure context a photo of the barcode replaces the live
// picture (ADR-0005); the chain after the code is the same.
type Mode = "starting" | "live" | "upload";

type Status =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "hit" }
  | { kind: "miss"; gtin: string }
  | { kind: "unreadable" }
  | { kind: "no-code" }
  // The label photo at the extraction; a failure offers a new photo or the hand. `gtin` is
  // the code of a miss; the label shutter without a barcode has none (SPEC 7).
  | { kind: "reading" }
  | { kind: "label-failed"; gtin?: string; photo: boolean };

const HINTS: Record<Mode, string> = {
  starting: "Kamera startet …",
  live: "Barcodes werden sofort erkannt. Für das Etikett auslösen.",
  upload: "Keine Kamera verfügbar. Wähle ein Foto des Barcodes oder des Etiketts.",
};

const STATUS_HINTS: Record<Exclude<Status["kind"], "idle" | "label-failed">, string> = {
  looking: "Suche Produkt …",
  hit: "Gefunden",
  miss: "Kein Treffer für diesen Barcode.",
  unreadable: "Barcode nicht lesbar. Bitte noch einmal.",
  "no-code": "Kein Barcode im Bild erkannt.",
  reading: "Lese Nährwerttabelle …",
};

/** 422: the photo is no readable image; otherwise (502) the model read no usable table. */
const labelFailedHint = (photo: boolean) =>
  photo
    ? "Foto nicht lesbar (JPEG, PNG oder WebP bis 10 MB)."
    : "Nährwerttabelle nicht erkannt. Neues Foto oder von Hand eingeben.";

const statusHint = (status: Exclude<Status, { kind: "idle" }>) =>
  status.kind === "label-failed" ? labelFailedHint(status.photo) : STATUS_HINTS[status.kind];

const CORNERS = [
  "top-0 left-0 rounded-tl-xl border-r-0 border-b-0",
  "top-0 right-0 rounded-tr-xl border-b-0 border-l-0",
  "bottom-0 left-0 rounded-bl-xl border-t-0 border-r-0",
  "right-0 bottom-0 rounded-br-xl border-t-0 border-l-0",
];

/**
 * Camera overlay from the prototype: finder frame with scan line over the live picture.
 * A recognised barcode goes to the backend without a shutter (SPEC 3); a hit turns the
 * frame green and hands the food on, a miss offers "Etikett fotografieren". The shutter
 * "Etikett" needs no barcode before. Both send the live picture (without camera a chosen
 * photo) to the extraction, the first with the GTIN of the miss, the second without one.
 */
export function Camera({
  onFound,
  onLabel,
  onClose,
}: {
  onFound: (food: BarcodeFood) => void;
  /**
   * The draft read from the label, or nothing to go on by hand; with the GTIN-14 of a miss,
   * without one after the shutter "Etikett".
   */
  onLabel: (gtin: string | undefined, label?: LabelExtraction) => void;
  onClose: () => void;
}) {
  // The overlay only mounts after a tap, so the browser check runs on the client.
  const [mode, setMode] = useState<Mode>(() => (cameraAvailable() ? "starting" : "upload"));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const labelFile = useRef<HTMLInputElement>(null);
  // The camera sees the same barcode in many frames: each code is looked up once, after a
  // failed lookup once more.
  const last = useRef<string | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handlers = useRef({ onFound, onLabel });
  useEffect(() => {
    handlers.current = { onFound, onLabel };
  });

  const lookUp = useRef(async (code: string) => {
    if (busy.current || code === last.current) return;
    busy.current = true;
    last.current = code;
    setStatus({ kind: "looking" });
    try {
      const result = await scanBarcode(code);
      if ("food" in result) {
        setStatus({ kind: "hit" });
        timer.current = setTimeout(() => handlers.current.onFound(result.food), HIT_DELAY_MS);
        return; // stays busy: no second lookup while the frame is green
      }
      setStatus({ kind: "miss", gtin: result.gtin });
    } catch (failure) {
      // 422 (no valid GTIN) or no backend: scanning goes on, the same code again after a pause.
      console.error(failure);
      setStatus({ kind: "unreadable" });
      clearTimeout(retry.current);
      retry.current = setTimeout(() => {
        if (last.current === code) last.current = null;
      }, RETRY_MS);
    }
    busy.current = false;
  });

  // Hangs on the camera, not on the mode: "starting" -> "live" must not stop the scan.
  const wantsCamera = mode !== "upload";
  useEffect(() => {
    if (!wantsCamera || !video.current) return;
    let live = true;
    let stop: (() => void) | undefined;
    scanLive(video.current, (code) => lookUp.current(code)).then(
      (stopScan) => {
        if (!live) return stopScan();
        stop = stopScan;
        setMode("live");
      },
      (failure) => {
        // Denied, no camera, or the camera is in use elsewhere.
        console.error(failure);
        if (live) setMode("upload");
      },
    );
    return () => {
      live = false;
      stop?.();
    };
  }, [wantsCamera]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(retry.current);
    },
    [],
  );

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0];
    event.target.value = ""; // the same photo can be chosen again
    if (!image || busy.current) return;
    const code = await decodeImage(image);
    if (!code) return setStatus({ kind: "no-code" });
    last.current = null; // a chosen photo is always looked up
    await lookUp.current(code);
  };

  /** The label photo goes to the extraction; no barcode lookup runs meanwhile. */
  const readLabel = async (gtin: string | undefined, photo: () => Promise<Blob>) => {
    if (busy.current) return;
    busy.current = true;
    setStatus({ kind: "reading" });
    try {
      const label = await extractLabel(await photo(), gtin);
      handlers.current.onLabel(gtin, label);
      return; // the overlay closes
    } catch (failure) {
      console.error(failure);
      setStatus({ kind: "label-failed", gtin, photo: failure instanceof ApiError && failure.status === 422 });
    }
    busy.current = false;
  };

  const hit = status.kind === "hit";
  const reading = status.kind === "reading";
  // The GTIN goes along while a miss is on screen; the status stays during the file choice.
  const labelGtin = status.kind === "miss" || status.kind === "label-failed" ? status.gtin : undefined;
  // A miss offers its own shutter with the GTIN, so "Etikett" does not stand beside it.
  const offer = labelGtin !== undefined;
  const shutter = !offer && !hit && !reading && mode !== "starting";

  const shoot = () => {
    if (mode === "upload") return labelFile.current?.click();
    const live = video.current;
    if (live) readLabel(labelGtin, () => captureFrame(live)).catch(console.error);
  };

  const pickLabel = (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0];
    event.target.value = ""; // the same photo can be chosen again
    if (image) readLabel(labelGtin, async () => image).catch(console.error);
  };

  return (
    <section
      aria-label="Kamera"
      className="absolute inset-0 z-30 flex flex-col bg-cam px-[18px] pt-[18px] pb-[calc(22px+env(safe-area-inset-bottom,0px))] text-cam-foreground"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Schließen"
          onClick={onClose}
          className="grid size-10 place-items-center rounded-xl bg-white/8 text-cam-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-cam-muted">Barcode · Etikett</span>
        <span className="w-10" />
      </div>

      <div className="relative grid flex-1 place-items-center overflow-hidden">
        {mode === "upload" ? (
          <>
            <button
              type="button"
              onClick={() => file.current?.click()}
              className="h-[52px] rounded-2xl bg-primary px-6 font-bold text-primary-foreground"
            >
              Foto wählen
            </button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              data-testid="barcode-photo"
              onChange={(e) => pick(e).catch(console.error)}
            />
          </>
        ) : (
          <>
            <video ref={video} muted playsInline aria-hidden="true" className="absolute inset-0 size-full object-cover" />
            <div data-testid="finder" data-hit={hit} className="relative aspect-[1/1.05] w-[78%] max-w-full">
              {CORNERS.map((corner) => (
                <i
                  key={corner}
                  className={cn("absolute size-[34px] border-[3px] border-cam-foreground", corner, hit && "border-fat")}
                />
              ))}
              <div
                className={cn(
                  "biss-scan absolute inset-x-[8%] h-0.5",
                  hit ? "bg-fat shadow-[0_0_14px_var(--biss-fat)]" : "bg-primary shadow-[0_0_14px_var(--biss-accent)]",
                )}
              />
            </div>
          </>
        )}
        {reading && (
          <div aria-hidden="true" className="absolute inset-0 grid place-items-center bg-cam/70">
            <div className="size-9 animate-spin rounded-full border-[3px] border-white/20 border-t-primary motion-reduce:animate-none" />
          </div>
        )}
      </div>

      <p role="status" className="my-3 text-center text-[13px] text-cam-muted">
        {status.kind === "idle" ? HINTS[mode] : statusHint(status)}
      </p>
      {(offer || shutter) && (
        <div className="mx-auto flex flex-col items-center gap-2">
          {offer ? (
            <button
              type="button"
              onClick={shoot}
              className="h-[54px] rounded-2xl bg-primary px-6 text-base font-bold text-primary-foreground"
            >
              Etikett fotografieren
            </button>
          ) : (
            // The shutter of the prototype, for the label without a barcode before (SPEC 3).
            <button type="button" onClick={shoot} className="grid justify-items-center gap-1.5 text-[13px] font-semibold">
              <span aria-hidden="true" className="grid size-[76px] place-items-center rounded-full border-4 border-cam-foreground">
                <span className="size-[58px] rounded-full bg-cam-foreground" />
              </span>
              Etikett
            </button>
          )}
          {status.kind === "label-failed" && (
            <button type="button" onClick={() => onLabel(labelGtin)} className="h-10 px-4 text-sm font-semibold text-cam-muted">
              Von Hand eingeben
            </button>
          )}
        </div>
      )}
      <input
        ref={labelFile}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="label-photo"
        onChange={pickLabel}
      />
    </section>
  );
}

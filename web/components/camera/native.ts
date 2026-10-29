// The browser's own barcode reader (Shape Detection API). Chrome on Android offers it in a
// secure context, which BISS has over Tailscale (ADR-0005); without it ZXing reads (ADR-0006).

type Detected = { rawValue: string; format: string };
type Detector = { detect(source: ImageBitmapSource): Promise<Detected[]> };
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/** The formats of scanner.ts in the names of the Shape Detection API. */
const FORMATS = ["ean_13", "ean_8", "upc_a"];
/** Pause between two reads of the live picture; detect itself takes a few ms on a phone. */
export const FRAME_MS = 100;

/** The detector for our formats, `null` when the browser has none or cannot read EAN-13. */
export async function nativeDetector(): Promise<Detector | null> {
  const Native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!Native) return null;
  try {
    const supported = await Native.getSupportedFormats();
    if (!supported.includes("ean_13")) return null;
    return new Native({ formats: FORMATS.filter((format) => supported.includes(format)) });
  } catch {
    return null;
  }
}

/**
 * A misread opens a wrong food and is worse than no read (ADR-0008): a code from the live
 * picture only counts once two frames in a row read the same digits.
 */
export function confirmer(onCode: (code: string) => void) {
  let previous: string | null = null;
  return (codes: string[]) => {
    const code = codes.length === 1 ? codes[0] : null;
    if (code !== null && code === previous) onCode(code);
    previous = code;
  };
}

/**
 * Reads the video with the detector until the stop function is called; every confirmed code
 * goes to `onCode`. The camera stream belongs to the caller.
 */
export function detectLive(detector: Detector, video: HTMLVideoElement, onCode: (code: string) => void) {
  const confirm = confirmer(onCode);
  let running = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = async () => {
    if (!running) return;
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      try {
        confirm((await detector.detect(video)).map((found) => found.rawValue));
      } catch {
        confirm([]); // a frame the detector cannot take, e.g. while the camera turns
      }
    }
    if (running) timer = setTimeout(read, FRAME_MS);
  };
  read();
  return () => {
    running = false;
    clearTimeout(timer);
  };
}

/** The code in a still picture, `null` without a detector or without exactly one code. */
export async function detectStill(source: ImageBitmapSource): Promise<string | null> {
  const detector = await nativeDetector();
  if (!detector) return null;
  try {
    const found = await detector.detect(source);
    return found.length === 1 ? found[0].rawValue : null;
  } catch {
    return null;
  }
}

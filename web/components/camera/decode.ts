// The barcode in a photo, on bare pixels: the browser gets them from a canvas (scanner.ts),
// the realdata test from sharp, so both run the same logic (ADR-0008). In a full phone
// photo (12 MP, the barcode small and askew) one read in full size finds nothing (#26).
import {
  BarcodeFormat,
  BinaryBitmap,
  ChecksumException,
  DecodeHintType,
  FormatException,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
  RGBLuminanceSource,
} from "@zxing/library";

/** Longest edges the photo is read at, in this order; a smaller photo stays as it is. */
const SIZES = [1600, 1000];
/**
 * A photo up to the smallest size is read at one size only; it is read once more at this
 * share of it, so that a second attempt can confirm an EAN-8 or UPC-A (#25).
 */
const CONFIRM = 0.8;
/** Turns of each size: ZXing reads 1D codes along rows only. */
const TURNS = [0, 90] as const;

/** Barcodes on consumer products; GTIN-14 (ITF-14) is printed on cartons only. */
const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]],
  [DecodeHintType.TRY_HARDER, true],
]);

type Luma = { data: Uint8ClampedArray; width: number; height: number };

/**
 * For each of `to` target pixels the source pixels of a triangle filter widened to the
 * scale, with weights summing to 1. Assigning whole pixels instead (a mean per target
 * pixel) makes bars uneven at a scale such as 0.94 and gave wrong EAN-8 reads (#26).
 */
function taps(from: number, to: number) {
  const ratio = from / to;
  const reach = Math.max(1, ratio);
  return Array.from({ length: to }, (_, t) => {
    const centre = (t + 0.5) * ratio - 0.5;
    const start = Math.max(0, Math.ceil(centre - reach));
    const end = Math.min(from - 1, Math.floor(centre + reach));
    const weights = Float32Array.from({ length: end - start + 1 }, (_, k) => 1 - Math.abs(start + k - centre) / reach);
    const total = weights.reduce((a, b) => a + b, 0);
    return { start, weights: weights.map((weight) => weight / total) };
  });
}

/** Grey values at `scale`, filtered first across, then down. */
function shrink(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, scale: number): Luma {
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const grey = new Uint8Array(width);
  const across = taps(width, w);
  const rows = new Float32Array(w * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) grey[x] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
    for (let x = 0; x < w; x++) {
      const { start, weights } = across[x];
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += grey[start + k] * weights[k];
      rows[y * w + x] = sum;
    }
  }
  const data = new Uint8ClampedArray(w * h);
  for (const [y, { start, weights }] of taps(height, h).entries()) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += rows[(start + k) * w + x] * weights[k];
      data[y * w + x] = sum + 0.5;
    }
  }
  return { data, width: w, height: h };
}

/** The grey picture turned by 90° clockwise. */
function turn({ data, width, height }: Luma): Luma {
  const turned = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) turned[x * height + (height - 1 - y)] = data[y * width + x];
  }
  return { data: turned, width: height, height: width };
}

/**
 * @zxing/library 0.23 warns for every reader that finds nothing: its NotFound, Checksum and
 * Format exceptions are no `instanceof ReaderException` there. Up to 12 such lines a photo
 * bury real warnings (#25); only these are left out, every other warning passes.
 */
export function quietly<T>(read: () => T): T {
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    const [message, error] = args;
    const noise =
      message === "MultiFormatReader: non-ReaderException from reader:" &&
      (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException);
    if (!noise) warn(...args);
  };
  try {
    return read();
  } finally {
    console.warn = warn;
  }
}

/** One read of an attempt: the digits and the format ZXing found them in. */
export type Read = { format: BarcodeFormat; text: string };

/**
 * The reads of the attempts in order: each size of SIZES (a small photo at its own size and
 * at CONFIRM of it) at each turn of TURNS, with TRY_HARDER.
 */
export function* attempts(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Generator<Read> {
  const reader = new MultiFormatReader();
  reader.setHints(HINTS);
  const scales = [...new Set(SIZES.map((size) => Math.min(1, size / Math.max(width, height))))];
  if (scales.length === 1) scales.push(scales[0] * CONFIRM);
  for (const scale of scales) {
    const luma = shrink(rgba, width, height, scale);
    for (const degrees of TURNS) {
      const { data, width: w, height: h } = degrees === 0 ? luma : turn(luma);
      // For 1D codes both binarizers give the same rows (getBlackRow), so one is enough.
      try {
        const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(data, w, h)));
        const result = quietly(() => reader.decodeWithState(bitmap));
        yield { format: result.getBarcodeFormat(), text: result.getText() };
      } catch {
        // NotFound, Checksum or Format: the next attempt.
      }
    }
  }
}

/**
 * The code the reads agree on, `null` without one. An EAN-13 counts at once. An EAN-8 or
 * UPC-A counts only once a second read gives the same digits: on the real photos ZXing read
 * an EAN-8 out of part of an EAN-13, and a wrong code opens a wrong food, worse than none
 * (#26, https://github.com/interias/BISS/issues/26#issuecomment-6477784580). Until then the
 * reads go on, and an EAN-13 among them wins.
 */
export function settle(reads: Iterable<Read>): string | null {
  const short = new Set<string>();
  for (const { format, text } of reads) {
    if (format === BarcodeFormat.EAN_13 || short.has(text)) return text;
    short.add(text);
  }
  return null;
}

/** The digits of the barcode in the photo, `null` without one. `rgba` holds 4 bytes per pixel. */
export function decodePixels(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): string | null {
  return settle(attempts(rgba, width, height));
}

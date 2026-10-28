// @vitest-environment node
import { expect, test, vi } from "vitest";
import { BarcodeFormat, FormatException, NotFoundException } from "@zxing/library";
import { ean13Modules, ean8Modules } from "@/e2e/barcode-image";
import { HIT_CODE } from "@/e2e/camera-setup";
import { attempts, decodePixels, quietly, settle } from "./decode";

/** Deterministic noise (mulberry32), so the picture is the same in every run. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A phone photo as in the find of 28.10.2026: 12 MP, the label small, turned by 90° plus
 * `skew` degrees (EAN-13, or EAN-8 for 8 digits), on a noisy, uneven background. RGBA, as
 * the canvas and sharp give it.
 */
function phonePhoto(code: string, { width = 4000, height = 3000, module = 5, skew = 5, seed = 1 } = {}) {
  const modules = code.length === 8 ? ean8Modules(code) : ean13Modules(code);
  const next = random(seed);
  const rgba = new Uint8ClampedArray(width * height * 4);
  const noise = () => (next() - 0.5) * 50;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const base = 105 + (45 * x) / width + (20 * y) / height; // light from one side
      rgba[i] = base + 18 + noise();
      rgba[i + 1] = base + 6 + noise();
      rgba[i + 2] = base - 12 + noise();
      rgba[i + 3] = 255;
    }
  }
  // The label: quiet zone of 11 modules on both sides, bars 70 modules high, off centre.
  const length = (modules.length + 22) * module;
  const tall = 75 * module;
  const [cx, cy] = [width * 0.58, height * 0.44];
  const angle = ((90 + skew) * Math.PI) / 180;
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const reach = Math.ceil(Math.hypot(length, tall) / 2) + 2;
  const ink = (u: number, v: number) => {
    if (Math.abs(u) > length / 2 || Math.abs(v) > tall / 2) return null;
    const m = Math.floor((u + length / 2) / module) - 11;
    return v < tall / 2 - 5 * module && m >= 0 && m < modules.length && modules[m] === "1" ? 35 : 222;
  };
  for (let y = Math.floor(cy - reach); y < cy + reach; y++) {
    for (let x = Math.floor(cx - reach); x < cx + reach; x++) {
      // 3 × 3 samples per pixel: the edges blur as in a photo.
      let sum = 0;
      let inside = 0;
      for (let s = 0; s < 9; s++) {
        const dx = x + ((s % 3) + 0.5) / 3 - cx;
        const dy = y + (Math.floor(s / 3) + 0.5) / 3 - cy;
        const value = ink(dx * cos + dy * sin, -dx * sin + dy * cos);
        if (value !== null) {
          sum += value;
          inside++;
        }
      }
      if (!inside) continue;
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = (sum + rgba[i + c] * (9 - inside)) / 9 + noise() * 0.6;
    }
  }
  return rgba;
}

// Regression of 28.10.2026 ("Kein Barcode erkannt"): read once in full size, without
// turning and TRY_HARDER, ZXing finds no barcode in such a photo.
test.each([
  { skew: 5, seed: 1 },
  { skew: -4, seed: 2 },
  { skew: 7, seed: 3 },
])("a small, turned barcode in a 12 MP phone photo is read (skew $skew°)", ({ skew, seed }) => {
  expect(decodePixels(phonePhoto(HIT_CODE, { skew, seed }), 4000, 3000)).toBe(HIT_CODE);
});

// A wrong code opens a wrong food (#26): a smaller label, which the reading may miss,
// gives the right digits or none, never other ones.
test.each([
  { module: 4, seed: 4 },
  { module: 3, seed: 5 },
  { module: 2, seed: 6 },
])("a smaller barcode in a phone photo gives the right code or none (module $module px)", ({ module, seed }) => {
  expect([HIT_CODE, null]).toContain(decodePixels(phonePhoto(HIT_CODE, { module, seed }), 4000, 3000));
});

test("a photo without a barcode gives null", () => {
  const next = random(9);
  const rgba = Uint8ClampedArray.from({ length: 1200 * 900 * 4 }, () => 128 + (next() - 0.5) * 60);
  expect(decodePixels(rgba, 1200, 900)).toBeNull();
});

// An EAN-8 or UPC-A counts only once a second attempt reads it too (#26): ZXing read an
// EAN-8 out of part of an EAN-13 in a real photo.
const EAN_8 = "96385074";

test("a clear EAN-8 in a phone photo is read: both sizes confirm it", () => {
  const photo = phonePhoto(EAN_8, { seed: 7 });
  expect([...attempts(photo, 4000, 3000)]).toEqual(Array(2).fill({ format: BarcodeFormat.EAN_8, text: EAN_8 }));
  expect(decodePixels(photo, 4000, 3000)).toBe(EAN_8);
});

test("an EAN-8 in a small photo is confirmed at a second, smaller size", () => {
  // Up to 1000 px SIZES give one size only; upright only the 0° attempt reads the bars, so
  // the read at CONFIRM of the size is the second attempt that confirms the code (#25).
  const photo = phonePhoto(EAN_8, { width: 1000, height: 750, module: 3, skew: -88, seed: 8 });
  expect([...attempts(photo, 1000, 750)]).toEqual(Array(2).fill({ format: BarcodeFormat.EAN_8, text: EAN_8 }));
  expect(decodePixels(photo, 1000, 750)).toBe(EAN_8);
});

test("settle: an EAN-13 counts at once, a short code once a second read confirms it", () => {
  const ean13 = { format: BarcodeFormat.EAN_13, text: HIT_CODE };
  const ean8 = { format: BarcodeFormat.EAN_8, text: EAN_8 };
  const upcA = { format: BarcodeFormat.UPC_A, text: "036000291452" };
  expect(settle([ean13])).toBe(HIT_CODE);
  expect(settle([ean8])).toBeNull();
  expect(settle([upcA])).toBeNull();
  expect(settle([upcA, ean8, upcA])).toBe(upcA.text);
  expect(settle([ean8, ean13, ean8])).toBe(HIT_CODE);
  expect(settle([])).toBeNull();
});

test("quietly leaves out the reader-found-nothing warnings of ZXing, and only those", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const message = "MultiFormatReader: non-ReaderException from reader:";
    // A photo without a barcode: each attempt makes ZXing warn without quietly.
    const noise = Uint8ClampedArray.from({ length: 200 * 150 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));
    expect(decodePixels(noise, 200, 150)).toBeNull();
    quietly(() => console.warn(message, new FormatException()));
    expect(warn).not.toHaveBeenCalled();
    // Anything else passes: another message, or another error behind the same message.
    quietly(() => console.warn("something else"));
    quietly(() => console.warn(message, new TypeError("real")));
    expect(warn.mock.calls.map(([first]) => first)).toEqual(["something else", message]);
    // Outside quietly console.warn is the original again.
    console.warn(message, new NotFoundException());
    expect(warn).toHaveBeenCalledTimes(3);
  } finally {
    warn.mockRestore();
  }
});

// @vitest-environment node
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { photoSet, realSets } from "@/e2e/real-fixtures";
import { decodePixels } from "./decode";

// Marker realdata (ADR-0008): the decode.ts logic of the browser over every real photo
// set on its own; at least 75 % of the photos per set give the right digits and none a wrong
// code (#26, decided 28.10.2026: ZXing reaches no more on these photos). A set without
// photos is skipped, never counted green. Run alone: vitest run -t realdata
const THRESHOLD = 0.75;

/** Same GTIN-14 as in the backend (SPEC 6): ZXing gives a UPC-A as 12 digits. */
const gtin = (code: string) => code.padStart(14, "0");

describe("realdata", () => {
  for (const { name, root } of realSets()) {
    const set = photoSet(root, "barcodes");
    if (set.empty) {
      test.skip(`${name}: no real photo set at ${set.dir}`, () => {});
      continue;
    }
    test(
      `${name}: barcodes of ${set.photos.length} photos at ${set.dir}, at least ${THRESHOLD * 100} % right and none wrong`,
      async () => {
        expect(set.problems, "every photo has its ground truth").toEqual([]);
        const misses: string[] = [];
        // A wrong code opens a wrong food, worse than none, after which the camera offers a new try.
        const wrong: string[] = [];
        const times: number[] = [];
        for (const { file, path, truth } of set.photos) {
          expect(truth.code, `${file}: code`).toMatch(/^(\d{8}|\d{12}|\d{13})$/);
          // EXIF orientation applied, as createImageBitmap does in the browser.
          const { data, info } = await sharp(path).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          const start = performance.now();
          const read = decodePixels(data, info.width, info.height);
          times.push(performance.now() - start);
          if (read === null) misses.push(`${file}: read nothing, expected ${truth.code}`);
          else if (gtin(read) !== gtin(truth.code)) wrong.push(`${file}: read ${read}, expected ${truth.code}`);
        }
        const hits = set.photos.length - misses.length - wrong.length;
        const rate = hits / set.photos.length;
        const sorted = [...times].sort((a, b) => a - b);
        console.log(
          [
            `realdata ${name}: ${hits}/${set.photos.length} = ${(rate * 100).toFixed(1)} % right, ${misses.length} nothing, ${wrong.length} wrong`,
            `  per photo: median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} ms, max ${sorted[sorted.length - 1].toFixed(0)} ms`,
            ...misses.map((m) => `  miss ${m}`),
            ...wrong.map((m) => `  wrong ${m}`),
          ].join("\n"),
        );
        expect(wrong, "no wrong code").toEqual([]);
        expect(rate, misses.join("; ")).toBeGreaterThanOrEqual(THRESHOLD);
      },
      // A 12 MP photo takes about a second per attempt.
      30_000 + set.photos.length * 10_000,
    );
  }
});

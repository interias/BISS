import { afterEach, expect, test, vi } from "vitest";
import { confirmer, detectLive, detectStill, FRAME_MS, nativeDetector } from "./native";

/** A BarcodeDetector of the browser that reads `frames` one after the other. */
function installDetector(frames: string[][], supported = ["ean_13", "ean_8", "upc_a", "qr_code"]) {
  const created: { formats: string[] }[] = [];
  let frame = 0;
  class FakeDetector {
    static getSupportedFormats = async () => supported;
    constructor(options: { formats: string[] }) {
      created.push(options);
    }
    async detect() {
      return (frames[Math.min(frame++, frames.length - 1)] ?? []).map((rawValue) => ({ rawValue, format: "ean_13" }));
    }
  }
  vi.stubGlobal("BarcodeDetector", FakeDetector);
  return created;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("without BarcodeDetector there is no native reader", async () => {
  expect(await nativeDetector()).toBeNull();
  expect(await detectStill(new Blob())).toBeNull();
});

test("a browser that cannot read EAN-13 offers no native reader", async () => {
  installDetector([], ["qr_code", "ean_8"]);
  expect(await nativeDetector()).toBeNull();
});

test("the detector is asked only for the formats of the scanner it supports", async () => {
  const created = installDetector([], ["ean_13", "upc_a", "qr_code"]);
  expect(await nativeDetector()).not.toBeNull();
  expect(created).toEqual([{ formats: ["ean_13", "upc_a"] }]);
});

test("a code counts once two frames in a row read the same digits", () => {
  const onCode = vi.fn();
  const confirm = confirmer(onCode);
  confirm(["4006040000001"]);
  expect(onCode).not.toHaveBeenCalled();
  confirm(["4006040000001"]);
  expect(onCode).toHaveBeenCalledWith("4006040000001");
});

test("a different read, an empty frame or two codes at once start the confirmation over", () => {
  const onCode = vi.fn();
  const confirm = confirmer(onCode);
  confirm(["4006040000001"]);
  confirm(["4006040000018"]);
  confirm([]);
  confirm(["4006040000018"]);
  confirm(["4006040000018", "96385074"]);
  confirm(["4006040000018"]);
  expect(onCode).not.toHaveBeenCalled();
});

test("the live picture is read frame by frame until it is stopped", async () => {
  vi.useFakeTimers();
  installDetector([["4006040000001"], ["4006040000001"], ["4006040000001"]]);
  const detector = await nativeDetector();
  const video = { readyState: 4, HAVE_CURRENT_DATA: 2 } as HTMLVideoElement;
  const onCode = vi.fn();
  const stop = detectLive(detector!, video, onCode);
  await vi.advanceTimersByTimeAsync(FRAME_MS + 1);
  expect(onCode).toHaveBeenCalledTimes(1);
  stop();
  await vi.advanceTimersByTimeAsync(FRAME_MS * 5);
  expect(onCode).toHaveBeenCalledTimes(1);
});

test("a still picture gives its code only when it holds exactly one", async () => {
  installDetector([["96385074"]]);
  expect(await detectStill(new Blob())).toBe("96385074");
  installDetector([["96385074", "4006040000001"]]);
  expect(await detectStill(new Blob())).toBeNull();
});

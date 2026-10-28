import { deflateSync } from "node:zlib";

// EAN-13 (and EAN-8 for decode.test.ts) drawn by hand, without a dependency: a PNG for the
// photo upload and a Y4M video for Chromium's fake camera (--use-file-for-fake-video-capture).

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R = L.map((code) => [...code].map((bit) => (bit === "0" ? "1" : "0")).join(""));
const G = R.map((code) => [...code].reverse().join(""));
// Which left digits use the G set, chosen by the first digit.
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** The 95 modules of an EAN-13 ("1" is a bar). */
export function ean13Modules(code: string) {
  if (!/^\d{13}$/.test(code)) throw new Error(`${code} is no EAN-13`);
  const digits = [...code].map(Number);
  const parity = PARITY[digits[0]];
  const left = digits.slice(1, 7).map((d, i) => (parity[i] === "L" ? L[d] : G[d])).join("");
  const right = digits.slice(7).map((d) => R[d]).join("");
  return `101${left}01010${right}101`;
}

/** The 67 modules of an EAN-8: four digits of the L set, four of the R set. */
export function ean8Modules(code: string) {
  if (!/^\d{8}$/.test(code)) throw new Error(`${code} is no EAN-8`);
  const digits = [...code].map(Number);
  return `101${digits.slice(0, 4).map((d) => L[d]).join("")}01010${digits.slice(4).map((d) => R[d]).join("")}101`;
}

/** A white picture with the barcode in the middle; one byte of luma per pixel. */
export function barcodeLuma(code: string, width: number, height: number, module: number) {
  const modules = ean13Modules(code);
  const pixels = Buffer.alloc(width * height, 255);
  const x0 = Math.floor((width - modules.length * module) / 2);
  const y0 = Math.floor(height * 0.2);
  const y1 = Math.ceil(height * 0.8);
  if (x0 < module * 9) throw new Error("no room for the quiet zone");
  for (let y = y0; y < y1; y++) {
    for (let m = 0; m < modules.length; m++) {
      if (modules[m] === "1") pixels.fill(0, y * width + x0 + m * module, y * width + x0 + (m + 1) * module);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer) {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit greyscale PNG of the barcode. */
export function barcodePng(code: string, width = 400, height = 200, module = 3) {
  const luma = barcodeLuma(code, width, height, module);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8); // bit depth 8, greyscale, deflate, no filter, no interlace
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) luma.copy(rows, y * (width + 1) + 1, y * width, (y + 1) * width);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * A Y4M video (4:2:0, 4 frames per second) that shows a white picture for `blank` frames,
 * then the barcode for `frames` frames; Chromium plays it in a loop. The blank start makes
 * the test fail unless the scan goes on past the first frame.
 */
export function barcodeY4m(code: string, width = 640, height = 360, module = 4, blank = 6, frames = 4) {
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128); // U and V: no colour
  const frame = (luma: Buffer) => Buffer.concat([Buffer.from("FRAME\n", "ascii"), luma, chroma]);
  const white = frame(Buffer.alloc(width * height, 255));
  const barcode = frame(barcodeLuma(code, width, height, module));
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F4:1 Ip A1:1 C420jpeg\n`, "ascii");
  return Buffer.concat([
    header,
    ...Array.from({ length: blank }, () => white),
    ...Array.from({ length: frames }, () => barcode),
  ]);
}

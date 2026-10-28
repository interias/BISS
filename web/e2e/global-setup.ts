import { writeFileSync } from "node:fs";
import { barcodeY4m } from "./barcode-image";
import { FAKE_VIDEO, HIT_CODE } from "./camera-setup";

/** Writes the fake camera's video before Chromium starts (it reads the file at launch). */
export default function globalSetup() {
  writeFileSync(FAKE_VIDEO, barcodeY4m(HIT_CODE));
}

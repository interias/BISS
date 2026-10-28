// ZXing in the browser (ADR-0006). Only reads the digits; the backend checks and normalises
// the code (ADR-0003). The library is loaded on first use, it is not needed for the page.

/** Barcodes on consumer products; GTIN-14 (ITF-14) is printed on cartons only. */
async function reader() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const formats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A];
  return new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, formats]]));
}

/** The browser offers a camera: a secure context (HTTPS or localhost, ADR-0005) with getUserMedia. */
export const cameraAvailable = () =>
  typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

/**
 * Scans the rear camera into the video element; every recognised code goes to `onCode`.
 * Resolves with the stop function once the camera runs, rejects without camera access.
 */
export async function scanLive(video: HTMLVideoElement, onCode: (code: string) => void) {
  const controls = await (await reader()).decodeFromConstraints(
    { video: { facingMode: "environment" }, audio: false },
    video,
    (result) => {
      if (result) onCode(result.getText());
    },
  );
  return () => controls.stop();
}

/** The code in a photo, `null` when ZXing finds none. */
export async function decodeImage(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    return (await (await reader()).decodeFromImageUrl(url)).getText();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

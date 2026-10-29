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

const CAMERA: MediaStreamConstraints = { video: { facingMode: "environment" }, audio: false };

/**
 * Scans the rear camera into the video element; every recognised code goes to `onCode`.
 * The browser's own reader goes first (native.ts), ZXing reads where there is none.
 * Resolves with the stop function once the camera runs, rejects without camera access.
 */
export async function scanLive(video: HTMLVideoElement, onCode: (code: string) => void) {
  const { nativeDetector, detectLive } = await import("@/components/camera/native");
  const detector = await nativeDetector();
  if (!detector) {
    const controls = await (await reader()).decodeFromConstraints(CAMERA, video, (result) => {
      if (result) onCode(result.getText());
    });
    return () => controls.stop();
  }
  const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
  const release = () => stream.getTracks().forEach((track) => track.stop());
  try {
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
  } catch (failure) {
    release();
    throw failure;
  }
  const stop = detectLive(detector, video, onCode);
  return () => {
    stop();
    release();
    video.srcObject = null;
  };
}

/**
 * The code in a photo, `null` when no reader finds one or the file is no image. The pixels
 * come upright from the canvas (EXIF orientation applied); decode.ts shrinks, turns and reads.
 * ZXing goes first, its quota is measured (ADR-0008); the browser's own reader only adds
 * the photos ZXing cannot read.
 */
export async function decodeImage(file: File): Promise<string | null> {
  try {
    const [{ decodePixels }, { detectStill }, bitmap] = await Promise.all([
      import("@/components/camera/decode"),
      import("@/components/camera/native"),
      createImageBitmap(file, { imageOrientation: "from-image" }),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    return decodePixels(data, width, height) ?? (await detectStill(canvas));
  } catch {
    return null;
  }
}

/** The current picture of the live video as JPEG, for the label photo. */
export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no camera picture"))), "image/jpeg", 0.92),
  );
}

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { biscuitLabel, fakeApi, PUDDING_CODE, puddingDraft } from "@/test/fixtures";
import { Camera, RETRY_MS } from "./camera";

// ZXing is mocked: the tests hand codes to the overlay as the decoder would.
const scanner = vi.hoisted(() => ({
  available: true,
  onCode: undefined as ((code: string) => void) | undefined,
  stop: vi.fn(),
  start: vi.fn(),
  decoded: null as string | null,
  frame: new Blob(["jpeg"], { type: "image/jpeg" }),
}));

vi.mock("@/components/camera/scanner", () => ({
  cameraAvailable: () => scanner.available,
  scanLive: async (_video: HTMLVideoElement, onCode: (code: string) => void) => {
    await scanner.start();
    scanner.onCode = onCode;
    return scanner.stop;
  },
  decodeImage: async () => scanner.decoded,
  captureFrame: async () => scanner.frame,
}));

const MISS_CODE = "2000000013022";

beforeEach(() => {
  scanner.available = true;
  scanner.onCode = undefined;
  scanner.start.mockReset();
  scanner.stop.mockReset();
  scanner.decoded = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderCamera = () => {
  const actions = { onFound: vi.fn(), onLabel: vi.fn(), onClose: vi.fn() };
  render(<Camera {...actions} />);
  return actions;
};

const detect = async (code: string) => {
  await waitFor(() => expect(scanner.onCode).toBeDefined());
  await act(async () => {
    scanner.onCode!(code);
  });
};

test("a recognised barcode turns the frame green and hands on the food", async () => {
  const { calls } = fakeApi();
  const { onFound } = renderCamera();
  expect(screen.getByTestId("finder")).toHaveAttribute("data-hit", "false");
  expect(await screen.findByText("Barcodes werden sofort erkannt.")).toBeInTheDocument();

  await detect(PUDDING_CODE);
  await waitFor(() => expect(screen.getByTestId("finder")).toHaveAttribute("data-hit", "true"));
  await waitFor(() => expect(onFound).toHaveBeenCalledWith(puddingDraft));
  // The raw code goes to the backend, which normalises it (ADR-0003).
  expect(calls.filter((c) => c.url.startsWith("/api/v1/foods/barcode/"))).toEqual([
    { method: "GET", url: `/api/v1/foods/barcode/${PUDDING_CODE}`, body: undefined },
  ]);
});

test("the same code in many frames is looked up once", async () => {
  const { calls } = fakeApi();
  renderCamera();
  await detect(MISS_CODE);
  await screen.findByRole("button", { name: "Etikett fotografieren" });
  await detect(MISS_CODE);
  await detect(MISS_CODE);
  expect(calls.filter((c) => c.url.startsWith("/api/v1/foods/barcode/"))).toHaveLength(1);
});

test("after a failed lookup the same code is tried again after a pause", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fakeApi();
  vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { onFound } = renderCamera();
  const lookups = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith("/api/v1/foods/barcode/"));

  await detect(PUDDING_CODE);
  expect(await screen.findByText("Barcode nicht lesbar. Bitte noch einmal.")).toBeInTheDocument();
  await detect(PUDDING_CODE); // still in the pause: no second request
  expect(lookups()).toHaveLength(1);

  act(() => vi.advanceTimersByTime(RETRY_MS));
  await detect(PUDDING_CODE);
  await waitFor(() => expect(onFound).toHaveBeenCalledWith(puddingDraft));
  expect(lookups()).toHaveLength(2);
});

const extractCalls = () =>
  vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/v1/labels/extract");

/** Holds the answer of the label extraction until `answer` is called. */
function holdExtraction() {
  const fake = vi.mocked(fetch).getMockImplementation()!;
  let answer: ((response: Response) => void) | undefined;
  vi.mocked(fetch).mockImplementation(async (url, init) =>
    url === "/api/v1/labels/extract" ? new Promise<Response>((resolve) => (answer = resolve)) : fake(url, init),
  );
  return async (response: Response) => {
    await waitFor(() => expect(answer).toBeDefined()); // the photo is taken first
    await act(async () => answer!(response));
  };
}

const failed = (status: number) =>
  new Response(JSON.stringify({ detail: "no structured output" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("without a hit the shutter sends the live picture with the GTIN-14 to the extraction", async () => {
  fakeApi();
  const answer = holdExtraction();
  const { onLabel, onFound } = renderCamera();
  await detect(MISS_CODE);
  expect(await screen.findByText("Kein Treffer für diesen Barcode.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Etikett fotografieren" }));

  expect(await screen.findByText("Lese Nährwerttabelle …")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Etikett fotografieren" })).not.toBeInTheDocument();
  const [[, init]] = extractCalls();
  const form = init!.body as FormData;
  expect(init!.method).toBe("POST");
  // The GTIN of the backend's miss goes along; the model never reads it (SPEC 7).
  expect(form.get("gtin")).toBe("0" + MISS_CODE);
  expect(form.get("file")).toBeInstanceOf(Blob);

  const label = biscuitLabel("0" + MISS_CODE);
  await answer(new Response(JSON.stringify(label), { headers: { "Content-Type": "application/json" } }));
  expect(onLabel).toHaveBeenCalledWith("0" + MISS_CODE, label);
  expect(onFound).not.toHaveBeenCalled();
});

test("a failed extraction offers a new photo or the editor by hand", async () => {
  fakeApi();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const answer = holdExtraction();
  const { onLabel } = renderCamera();
  await detect(MISS_CODE);
  fireEvent.click(await screen.findByRole("button", { name: "Etikett fotografieren" }));
  await answer(failed(502));

  expect(screen.getByText("Nährwerttabelle nicht erkannt. Neues Foto oder von Hand eingeben.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Etikett fotografieren" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Von Hand eingeben" }));
  expect(onLabel).toHaveBeenCalledWith("0" + MISS_CODE);
});

test("without camera the label is a chosen photo; an unreadable one says so", async () => {
  scanner.available = false;
  scanner.decoded = MISS_CODE;
  fakeApi();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { onLabel } = renderCamera();
  const photo = new File(["png"], "barcode.png", { type: "image/png" });
  fireEvent.change(screen.getByTestId("barcode-photo"), { target: { files: [photo] } });
  await screen.findByRole("button", { name: "Etikett fotografieren" });

  const input = screen.getByTestId("label-photo");
  expect(input).toHaveAttribute("capture", "environment");
  const click = vi.spyOn(input, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Etikett fotografieren" }));
  expect(click).toHaveBeenCalled(); // opens the photo choice instead of a live picture

  const answer = holdExtraction();
  const label = new File(["jpeg"], "etikett.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [label] } });
  expect(await screen.findByText("Lese Nährwerttabelle …")).toBeInTheDocument();
  expect((extractCalls()[0][1]!.body as FormData).get("file")).toBeInstanceOf(File);
  await answer(failed(422));
  expect(screen.getByText("Foto nicht lesbar (JPEG, PNG oder WebP bis 10 MB).")).toBeInTheDocument();
  expect(onLabel).not.toHaveBeenCalled();
});

test("the camera runs while live and stops on closing", async () => {
  fakeApi();
  const { onClose } = renderCamera();
  expect(await screen.findByText("Barcodes werden sofort erkannt.")).toBeInTheDocument();
  await act(async () => {}); // let the effects of the live mode run
  expect(scanner.stop).toHaveBeenCalledTimes(0);
  fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
  expect(onClose).toHaveBeenCalled();
  cleanup(); // the parent unmounts the overlay on close
  expect(scanner.stop).toHaveBeenCalledTimes(1);
});

test("without a secure context or camera a photo of the barcode goes the same way", async () => {
  scanner.available = false;
  scanner.decoded = PUDDING_CODE;
  fakeApi();
  const { onFound } = renderCamera();
  expect(screen.getByText("Keine Kamera verfügbar. Wähle ein Foto des Barcodes.")).toBeInTheDocument();
  expect(screen.queryByTestId("finder")).not.toBeInTheDocument();
  expect(scanner.start).not.toHaveBeenCalled();

  const photo = new File(["png"], "barcode.png", { type: "image/png" });
  fireEvent.change(screen.getByTestId("barcode-photo"), { target: { files: [photo] } });
  await waitFor(() => expect(onFound).toHaveBeenCalledWith(puddingDraft));
});

test("a denied camera falls back to the photo", async () => {
  scanner.start.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  fakeApi();
  renderCamera();
  expect(await screen.findByRole("button", { name: "Foto wählen" })).toBeInTheDocument();
  expect(screen.getByTestId("barcode-photo")).toHaveAttribute("accept", "image/*");
});

test("a photo without a barcode says so, a miss keeps the photo choice", async () => {
  scanner.available = false;
  fakeApi();
  renderCamera();
  const input = screen.getByTestId("barcode-photo");
  const photo = new File(["png"], "barcode.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [photo] } });
  expect(await screen.findByText("Kein Barcode im Bild erkannt.")).toBeInTheDocument();

  scanner.decoded = MISS_CODE;
  fireEvent.change(input, { target: { files: [photo] } });
  expect(await screen.findByRole("button", { name: "Etikett fotografieren" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Foto wählen" })).toBeInTheDocument();
});

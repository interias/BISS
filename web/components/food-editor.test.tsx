import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { FoodDetail } from "@/lib/api";
import { bananaDetail } from "@/test/fixtures";
import { EditorForm } from "./food-editor";

afterEach(() => vi.unstubAllGlobals());

// SheetTitle needs a dialog around it.
const inDialog = (node: ReactNode) =>
  render(
    <Dialog.Root open>
      <Dialog.Content aria-describedby={undefined}>{node}</Dialog.Content>
    </Dialog.Root>,
  );

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const plausible = { atwater: { computed_kcal: 93.4, deviation_pct: 0.4, ok: true } };

const stubObjectUrls = () =>
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:photo", revokeObjectURL: () => {} }));

type Call = { method: string; url: string; body?: unknown };

/** Fake backend: validate answers `validation`, POST/PATCH/PUT answer `saved`. */
function fakeBackend(saved: FoodDetail = bananaDetail, validation: unknown = plausible) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
      calls.push({ method: init?.method ?? "GET", url, body });
      if (url === "/api/v1/foods/validate") return json(validation);
      return json(saved, init?.method === "POST" ? 201 : 200);
    }),
  );
  return calls;
}

const field = (name: string) => screen.getByLabelText(name);
const type = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
const rowOf = (index: number) => within(screen.getAllByRole("listitem")[index]);
const addServing = () => fireEvent.click(screen.getByRole("button", { name: "+ Portion hinzufügen" }));
const noop = () => {};

test("an existing food fills the table and the portion list with origin tags", () => {
  fakeBackend();
  inDialog(<EditorForm food={bananaDetail} onSaved={noop} onCancel={noop} />);
  expect(field("Name")).toHaveValue("Banane roh");
  expect(field("Energie (kcal)")).toHaveValue("93");
  expect(field("Eiweiß (g)")).toHaveValue("1,1");
  expect(field("Salz (g)")).toHaveValue("0");
  expect(screen.getByRole("button", { name: "Speichern" })).toBeEnabled();
  expect(rowOf(0).getByLabelText("Bezeichnung")).toHaveValue("1 Banane");
  expect(rowOf(0).getByLabelText("Gramm")).toHaveValue("120");
  expect(rowOf(0).getByTestId("origin")).toHaveTextContent("geschätzt");
  expect(rowOf(0).getByRole("button", { name: "Als Standard setzen" })).toHaveAttribute("aria-pressed", "true");
});

test("the Atwater hint shows what the backend answers, live while typing", async () => {
  const calls = fakeBackend(bananaDetail, {
    atwater: { computed_kcal: 436, deviation_pct: 336, ok: false },
  });
  inDialog(<EditorForm food={bananaDetail} onSaved={noop} onCancel={noop} />);
  type("Fett (g)", "45");
  const hint = screen.getByTestId("atwater");
  await waitFor(() => expect(hint).toHaveTextContent("Unplausibel: aus Makros 436 kcal"));
  expect(hint).toHaveTextContent("336,0 % Abweichung). Bitte Werte prüfen.");
  const validate = calls.filter((c) => c.url === "/api/v1/foods/validate").at(-1);
  expect(validate?.body).toEqual({ kcal: 93, protein: 1.1, carbs: 20, fat: 45, fiber: 2 });
});

test("text that is no number asks for numbers and does not call the backend", async () => {
  const calls = fakeBackend();
  inDialog(<EditorForm food={bananaDetail} onSaved={noop} onCancel={noop} />);
  await waitFor(() => expect(screen.getByTestId("atwater")).toHaveTextContent("Plausibel"));
  const before = calls.length;
  type("Energie (kcal)", "abc");
  expect(screen.getByTestId("atwater")).toHaveTextContent("Bitte nur Zahlen ab 0 eingeben.");
  expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(calls).toHaveLength(before);
});

test("changing a portion shows eigene at once, the star alone does not", () => {
  fakeBackend();
  const food = {
    ...bananaDetail,
    servings: [
      { id: 1, label: "1 Banane", grams: 120, origin: "estimated" as const, is_default: true },
      { id: 2, label: "1 Packung", grams: 500, origin: "package" as const, is_default: false },
    ],
  };
  inDialog(<EditorForm food={food} onSaved={noop} onCancel={noop} />);
  expect(rowOf(1).getByTestId("origin")).toHaveTextContent("Packung");
  fireEvent.click(rowOf(1).getByRole("button", { name: "Als Standard setzen" }));
  expect(rowOf(1).getByRole("button", { name: "Als Standard setzen" })).toHaveAttribute("aria-pressed", "true");
  expect(rowOf(0).getByRole("button", { name: "Als Standard setzen" })).toHaveAttribute("aria-pressed", "false");
  expect(rowOf(1).getByTestId("origin")).toHaveTextContent("Packung");

  fireEvent.change(rowOf(1).getByLabelText("Gramm"), { target: { value: "450" } });
  expect(rowOf(1).getByTestId("origin")).toHaveTextContent("eigene");
  fireEvent.change(rowOf(0).getByLabelText("Bezeichnung"), { target: { value: "Banane" } });
  expect(rowOf(0).getByTestId("origin")).toHaveTextContent("eigene");
});

test("a removed serving leaves the list and the first one takes over the star", () => {
  fakeBackend();
  const food = {
    ...bananaDetail,
    servings: [
      { id: 1, label: "1 Banane", grams: 120, origin: "estimated" as const, is_default: true },
      { id: 2, label: "1 Packung", grams: 500, origin: "package" as const, is_default: false },
    ],
  };
  inDialog(<EditorForm food={food} onSaved={noop} onCancel={noop} />);
  fireEvent.click(rowOf(0).getByRole("button", { name: "Portion entfernen" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(rowOf(0).getByLabelText("Bezeichnung")).toHaveValue("1 Packung");
  expect(rowOf(0).getByRole("button", { name: "Als Standard setzen" })).toHaveAttribute("aria-pressed", "true");
});

test("Speichern sends the complete servings list; a blank new row is dropped", async () => {
  const calls = fakeBackend();
  const onSaved = vi.fn();
  inDialog(<EditorForm food={bananaDetail} onSaved={onSaved} onCancel={noop} />);
  type("Marke", " Chiquita ");
  fireEvent.change(rowOf(0).getByLabelText("Gramm"), { target: { value: "130,5" } });
  addServing();
  addServing();
  fireEvent.change(rowOf(1).getByLabelText("Bezeichnung"), { target: { value: "1 Handvoll" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(bananaDetail));
  const patch = calls.find((c) => c.method === "PATCH");
  expect(patch?.url).toBe("/api/v1/foods/7");
  expect(patch?.body).toEqual({
    name: "Banane roh",
    brand: "Chiquita",
    per_100: { kcal: 93, protein: 1.1, carbs: 20, fat: 0.2, fiber: 2, sugar: 17, sat_fat: 0.1, salt: 0 },
    servings: [
      { id: 1, label: "1 Banane", grams: 130.5, is_default: true },
      { label: "1 Handvoll", grams: 100, is_default: false },
    ],
  });
});

test("a new food needs a name, is created with its servings and the photo follows", async () => {
  const calls = fakeBackend({ ...bananaDetail, id: 99, name: "Skyr", image_path: "99.webp" });
  const onSaved = vi.fn();
  stubObjectUrls();
  inDialog(<EditorForm onSaved={onSaved} onCancel={noop} />);
  expect(screen.getByRole("button", { name: "Speichern & eintragen" })).toBeDisabled();
  type("Name", "Skyr");
  type("Energie (kcal)", "63");
  type("Eiweiß (g)", "11");
  type("Kohlenhydrate (g)", "4");
  type("Fett (g)", "0,2");
  addServing();
  fireEvent.change(rowOf(0).getByLabelText("Bezeichnung"), { target: { value: "1 Becher" } });
  fireEvent.change(rowOf(0).getByLabelText("Gramm"), { target: { value: "150" } });
  addServing();
  fireEvent.change(rowOf(1).getByLabelText("Bezeichnung"), { target: { value: "1 Löffel" } });
  fireEvent.change(rowOf(1).getByLabelText("Gramm"), { target: { value: "20" } });
  fireEvent.click(rowOf(1).getByRole("button", { name: "Als Standard setzen" }));
  const file = new File(["x"], "skyr.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByTestId("photo-gallery"), { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern & eintragen" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(onSaved.mock.calls[0][0]).toMatchObject({ id: 99, image_path: "99.webp" });
  const post = calls.find((c) => c.method === "POST" && c.url === "/api/v1/foods");
  expect(post?.body).toEqual({
    name: "Skyr",
    brand: null,
    per_100: { kcal: 63, protein: 11, carbs: 4, fat: 0.2, fiber: null, sugar: null, sat_fat: null, salt: null },
    servings: [
      { label: "1 Becher", grams: 150, is_default: false },
      { label: "1 Löffel", grams: 20, is_default: true },
    ],
  });
  const put = calls.find((c) => c.method === "PUT");
  expect(put?.url).toBe("/api/v1/foods/99/image");
  expect((put?.body as FormData).get("file")).toBeInstanceOf(File);
});

test("the camera input asks for the rear camera, the gallery input does not", () => {
  fakeBackend();
  inDialog(<EditorForm onSaved={noop} onCancel={noop} />);
  expect(screen.getByTestId("photo-camera")).toHaveAttribute("capture", "environment");
  expect(screen.getByTestId("photo-gallery")).not.toHaveAttribute("capture");
  expect(screen.getByTestId("photo-gallery")).toHaveAttribute("accept", "image/*");
});

test("a failed photo upload keeps the sheet open and a retry updates instead of creating", async () => {
  const saved = { ...bananaDetail, id: 99, servings: [{ ...bananaDetail.servings[0], id: 5 }] };
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", url });
      if (url === "/api/v1/foods/validate") return json(plausible);
      if (init?.method === "PUT") return json({ detail: "bad" }, 422);
      return json(saved, init?.method === "POST" ? 201 : 200);
    }),
  );
  stubObjectUrls();
  const onSaved = vi.fn();
  inDialog(<EditorForm onSaved={onSaved} onCancel={noop} />);
  type("Name", "Banane");
  fireEvent.change(screen.getByTestId("photo-gallery"), {
    target: { files: [new File(["x"], "b.jpg", { type: "image/jpeg" })] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Speichern & eintragen" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Gespeichert, aber das Foto ging nicht");
  expect(onSaved).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Speichern & eintragen" }));
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2));
  expect(calls.filter((c) => c.method === "POST" && c.url === "/api/v1/foods")).toHaveLength(1);
  expect(calls.some((c) => c.method === "PATCH" && c.url === "/api/v1/foods/99")).toBe(true);
});

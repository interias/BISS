import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { coffeeCombo, fakeApi, PUDDING_CODE, puddingDraft } from "@/test/fixtures";
import { Home } from "./home";

// No camera in jsdom: the overlay takes a photo, and ZXing "reads" this code from it.
const photo = vi.hoisted(() => ({ code: "" }));
vi.mock("@/components/camera/scanner", () => ({
  cameraAvailable: () => false,
  scanLive: async () => () => {},
  decodeImage: async () => photo.code,
  captureFrame: async () => new Blob(),
}));

afterEach(() => vi.unstubAllGlobals());

test("shows the header date of the backend's day and one diary without meals", async () => {
  fakeApi();
  render(<Home />);
  expect(await screen.findByText("Heute · Mi 28. Okt")).toBeInTheDocument();
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  for (const meal of ["Frühstück", "Mittag", "Snack", "Abend"]) {
    expect(within(diary).queryByText(meal)).not.toBeInTheDocument();
  }
  expect(within(diary).getAllByText("Noch nichts eingetragen")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Lebensmittel suchen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Kamera/ })).toBeInTheDocument();
});

test("a recent chip sends only the food, Rückgängig deletes the new entry", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  const chips = await screen.findByRole("group", { name: "Zuletzt gegessen" });
  fireEvent.click(await within(chips).findByRole("button", { name: /Banane roh\s*120 g/ }));

  // ADR-0003: no grams, no meal; the backend picks the standard serving and the meal.
  await screen.findByText("Banane roh eingetragen");
  const post = calls.find((c) => c.method === "POST");
  expect(post).toEqual({ method: "POST", url: "/api/v1/entries", body: { food_id: 7 } });
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  expect(within(diary).getByText("Banane roh")).toBeInTheDocument();
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("112");

  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
  await waitFor(() => expect(within(diary).queryByText("Banane roh")).not.toBeInTheDocument());
  expect(calls.some((c) => c.method === "DELETE" && c.url.startsWith("/api/v1/entries/"))).toBe(true);
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("0");
});

async function openAmountOfBanana() {
  fireEvent.click(await screen.findByRole("button", { name: "Lebensmittel suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "banane" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Banane roh/ }));
  await screen.findByRole("heading", { name: "Banane roh" });
}

test("Bearbeiten opens the editor and Abbrechen returns with the same grams", async () => {
  fakeApi();
  render(<Home />);
  await openAmountOfBanana();
  fireEvent.click(screen.getByRole("button", { name: "mehr" })); // 130 g
  fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));

  expect(await screen.findByLabelText("Name")).toHaveValue("Banane roh");
  expect(screen.queryByRole("spinbutton", { name: "Menge" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

  expect(await screen.findByRole("spinbutton", { name: "Menge" })).toHaveValue(130);
});

test("the diary lists entries and groups newest first, each with its time", async () => {
  fakeApi({ combos: [coffeeCombo()] });
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: /Banane roh\s*120 g/ }));
  await screen.findByText("Banane roh eingetragen");
  fireEvent.click(await comboChip());
  await screen.findByText("Kaffee eingetragen · 24 kcal");
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  const rows = within(diary).getAllByRole("button", { name: /Banane roh|^Kaffee/ });
  // Both at the fake's time; the later one, the combo, stands first.
  expect(rows.map((row) => row.textContent?.slice(0, 6))).toEqual(["Kaffee", "Banane"]);
  expect(rows[1]).toHaveTextContent("10:05");
});

test("saving in the editor returns to the amount sheet with the new name", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await openAmountOfBanana();
  fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Banane, reif" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

  expect(await screen.findByRole("heading", { name: "Banane, reif" })).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "Menge" })).toHaveValue(120);
  expect(await screen.findByText("Lebensmittel gespeichert")).toBeInTheDocument();
  expect(calls.some((c) => c.method === "PATCH" && c.url === "/api/v1/foods/7")).toBe(true);
});

test("an empty search offers Neu anlegen; Speichern & eintragen leads into the amount sheet", async () => {
  fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Lebensmittel suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "xyz" } });
  fireEvent.click(await screen.findByRole("button", { name: "Neu anlegen" }));

  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Skyr" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern & eintragen" }));
  expect(await screen.findByRole("heading", { name: "Skyr" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Eintragen · / })).toBeInTheDocument();
});

async function scanPhoto(code: string) {
  photo.code = code;
  fireEvent.click(await screen.findByRole("button", { name: /^Kamera/ }));
  const file = new File(["png"], "barcode.png", { type: "image/png" });
  fireEvent.change(screen.getByTestId("barcode-photo"), { target: { files: [file] } });
}

test("a scanned draft opens the amount sheet with the source note and is logged by GTIN", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await scanPhoto(PUDDING_CODE);

  expect(await screen.findByRole("heading", { name: "Testpudding Schoko" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Kamera" })).not.toBeInTheDocument();
  expect(screen.getByText("Daten von Open Food Facts (ODbL)")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "Menge" })).toHaveValue(200);
  expect(screen.queryByRole("button", { name: "Bearbeiten" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 148 kcal" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST")).toEqual({
    method: "POST",
    url: "/api/v1/entries",
    body: { gtin: "0" + PUDDING_CODE, grams: 200 },
  });
});

test("a cached product in the search opens the amount sheet and is logged by GTIN", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Lebensmittel suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "pudding" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Testpudding Schoko/ }));

  // No food yet: the barcode chain answers the cached draft by its GTIN.
  expect(await screen.findByRole("heading", { name: "Testpudding Schoko" })).toBeInTheDocument();
  expect(calls.some((c) => c.url === `/api/v1/foods/barcode/${puddingDraft.gtin}`)).toBe(true);
  expect(screen.getByText("Daten von Open Food Facts (ODbL)")).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "Menge" })).toHaveValue(200);

  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 148 kcal" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST")).toEqual({
    method: "POST",
    url: "/api/v1/entries",
    body: { gtin: puddingDraft.gtin, grams: 200 },
  });
  expect(calls.some((c) => /^\/api\/v1\/foods\/\d+$/.test(c.url))).toBe(false); // no food was loaded
});

async function photographLabel() {
  await scanPhoto("2000000013022");
  await screen.findByRole("button", { name: "Etikett fotografieren" });
  const label = new File(["jpeg"], "etikett.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByTestId("label-photo"), { target: { files: [label] } });
}

test("the label photo opens the filled editor; Speichern & eintragen and Eintragen log it", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await photographLabel();

  expect(await screen.findByText("Neu · aus Etikett gelesen")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Kamera" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("GTIN")).toHaveValue("02000000013022");
  expect(screen.getByLabelText("Name")).toHaveValue("Haferkeks Dinkel");

  fireEvent.click(screen.getByRole("button", { name: "Speichern & eintragen" }));
  expect(await screen.findByRole("heading", { name: "Haferkeks Dinkel" })).toBeInTheDocument();
  expect(calls.find((c) => c.method === "POST" && c.url === "/api/v1/foods")?.body).toMatchObject({
    gtin: "02000000013022",
  });
  fireEvent.click(screen.getByRole("button", { name: /^Eintragen · / }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/v1/entries")).toBe(true));
  expect(calls.find((c) => c.method === "POST" && c.url === "/api/v1/entries")?.body).toMatchObject({ food_id: 55 });
});

test("by hand after a failed extraction opens the empty editor with the GTIN", async () => {
  fakeApi();
  const fake = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) =>
    url === "/api/v1/labels/extract" ? new Response("{}", { status: 502 }) : fake(url, init),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<Home />);
  await photographLabel();
  fireEvent.click(await screen.findByRole("button", { name: "Von Hand eingeben" }));

  expect(await screen.findByText("Neues Lebensmittel")).toBeInTheDocument();
  expect(screen.getByLabelText("GTIN")).toHaveValue("02000000013022");
  expect(screen.getByLabelText("Name")).toHaveValue("");
});

async function photographPlate() {
  fireEvent.click(await screen.findByRole("button", { name: /^Kamera/ }));
  const file = new File(["jpeg"], "teller.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByTestId("plate-photo"), { target: { files: [file] } });
}

/** The Gericht logged from the fake plate: the diary shows it as a group. */
async function logPlate() {
  await photographPlate();
  fireEvent.click(await screen.findByRole("button", { name: "Eintragen · 399 kcal" }));
  return await screen.findByText("Hähnchen mit Reis und Brokkoli eingetragen");
}

test("the plate photo opens the result sheet; Eintragen logs one group and the diary shows its sum", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await photographPlate();

  expect(await screen.findByText("Erkannt · bitte prüfen")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Kamera" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Gericht" })).toHaveValue("Hähnchen mit Reis und Brokkoli");
  // Banane is a recent chip and not on the plate: a suggestion (rice is on it).
  const suggestions = screen.getByRole("group", { name: "Vorschläge" });
  expect(within(suggestions).getByRole("button", { name: "+ Banane roh" })).toBeInTheDocument();
  expect(within(suggestions).queryByRole("button", { name: "+ Reis gekocht" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 399 kcal" }));
  await screen.findByText("Hähnchen mit Reis und Brokkoli eingetragen");
  // One call, no meal: the backend suggests it (ADR-0003); the sheet is closed.
  expect(calls.filter((c) => c.method === "POST" && c.url === "/api/v1/entries/group")).toEqual([
    {
      method: "POST",
      url: "/api/v1/entries/group",
      body: {
        group_name: "Hähnchen mit Reis und Brokkoli",
        items: [
          { food_id: 9, grams: 120 },
          { food_id: 8, grams: 150 },
          { food_id: 10, grams: 80 },
        ],
      },
    },
  ]);
  expect(calls.some((c) => c.method === "POST" && c.url === "/api/v1/entries")).toBe(false);
  expect(screen.queryByText("Erkannt · bitte prüfen")).not.toBeInTheDocument();

  // The group stands in the diary with the sum of the day response, folded.
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  const group = within(diary).getByRole("button", { name: /Hähnchen mit Reis und Brokkoli/ });
  expect(group).toHaveAttribute("aria-expanded", "false");
  expect(group).toHaveTextContent("399");
  expect(group).toHaveTextContent("3 Zutaten");
  expect(within(diary).queryByText("Reis gekocht")).not.toBeInTheDocument();
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("399");

  fireEvent.click(group);
  expect(group).toHaveAttribute("aria-expanded", "true");
  expect(within(diary).getByText("Reis gekocht")).toBeInTheDocument();
  expect(within(diary).getByText("Broccoli gekocht")).toBeInTheDocument();
});

test("Rückgängig after logging a plate removes the whole group", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await logPlate();
  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));

  await waitFor(() => expect(screen.queryByText(/3 Zutaten/)).not.toBeInTheDocument());
  expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/v1/entries/group/group-200")).toBe(true);
  expect(calls.some((c) => c.method === "DELETE" && /^\/api\/v1\/entries\/\d+$/.test(c.url))).toBe(false);
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("0");
});

test("Verwerfen closes the plate sheet and logs nothing", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await photographPlate();
  fireEvent.click(await screen.findByRole("button", { name: "Verwerfen" }));
  await waitFor(() => expect(screen.queryByText("Erkannt · bitte prüfen")).not.toBeInTheDocument());
  expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/v1/plates/extract"]);
});

test("Gericht entfernen deletes the group; Rückgängig logs it again with name, meal, time and amounts", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await logPlate();
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  fireEvent.click(within(diary).getByRole("button", { name: /Hähnchen mit Reis und Brokkoli/ }));
  fireEvent.click(within(diary).getByRole("button", { name: "Gericht entfernen" }));

  await screen.findByText("Hähnchen mit Reis und Brokkoli entfernt");
  expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/v1/entries/group/group-200"]);
  expect(within(diary).queryByText(/3 Zutaten/)).not.toBeInTheDocument();
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("0");

  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
  await waitFor(() => expect(within(diary).getByText(/3 Zutaten/)).toBeInTheDocument());
  const posts = calls.filter((c) => c.method === "POST" && c.url === "/api/v1/entries/group");
  expect(posts).toHaveLength(2);
  expect(posts[1].body).toEqual({
    group_name: "Hähnchen mit Reis und Brokkoli",
    meal: "snack",
    eaten_at: "2026-10-28T10:05:00+01:00",
    items: [
      { food_id: 9, grams: 120 },
      { food_id: 8, grams: 150 },
      { food_id: 10, grams: 80 },
    ],
  });
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("399");
});

test("an entry of a Gericht opens the amount sheet without a meal", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await logPlate();
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  fireEvent.click(within(diary).getByRole("button", { name: /Hähnchen mit Reis und Brokkoli/ }));
  fireEvent.click(within(diary).getByText("Reis gekocht"));

  expect(await screen.findByRole("heading", { name: "Reis gekocht" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Mahlzeit/ })).not.toBeInTheDocument();
  expect(calls.some((c) => c.method === "PATCH")).toBe(false);
});

const comboChip = () => screen.findByRole("button", { name: "Schnellzugriff Kaffee" });

test("a Schnellzugriff chip logs the combo in one call; Rückgängig removes the whole group", async () => {
  const { calls } = fakeApi({ combos: [coffeeCombo()] });
  render(<Home />);
  fireEvent.click(await comboChip());

  await screen.findByText("Kaffee eingetragen · 24 kcal");
  // Only the combo: the backend takes its items and suggests the meal (ADR-0003).
  expect(calls.filter((c) => c.method === "POST")).toEqual([
    { method: "POST", url: "/api/v1/combos/1/log", body: {} },
  ]);
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  const group = within(diary).getByRole("button", { name: /^Kaffee/ });
  expect(group).toHaveTextContent("2 Zutaten");
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("24");
  // A group with the name of a combo offers no second one.
  expect(within(diary).queryByRole("button", { name: "als Schnellzugriff merken" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
  await waitFor(() => expect(within(diary).queryByText(/2 Zutaten/)).not.toBeInTheDocument());
  expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/v1/entries/group/group-200"]);
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("0");
});

test("a long press opens the combo; Eintragen logs the adjusted items, the template stays", async () => {
  const { calls } = fakeApi({ combos: [coffeeCombo()] });
  render(<Home />);
  fireEvent.contextMenu(await comboChip());

  expect(await screen.findByRole("dialog", { name: "Schnellzugriff anpassen" })).toBeInTheDocument();
  expect(calls.some((c) => c.method === "POST")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Zucker mehr" })); // 6 g
  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 28 kcal" }));

  await screen.findByText("Kaffee eingetragen · 28 kcal");
  expect(calls.find((c) => c.method === "POST")).toEqual({
    method: "POST",
    url: "/api/v1/combos/1/log",
    body: {
      items: [
        { food_id: 12, grams: 200 },
        { food_id: 11, grams: 6 },
      ],
    },
  });
  expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("Als Vorlage speichern and Löschen change the combo of the dock", async () => {
  const { calls } = fakeApi({ combos: [coffeeCombo()] });
  render(<Home />);
  fireEvent.contextMenu(await comboChip());
  fireEvent.change(await screen.findByRole("textbox", { name: "Name" }), { target: { value: "Kaffee süß" } });
  fireEvent.click(screen.getByRole("button", { name: "Als Vorlage speichern" }));

  await screen.findByText("Kaffee süß als Schnellzugriff gespeichert");
  expect(calls.find((c) => c.method === "PATCH")).toEqual({
    method: "PATCH",
    url: "/api/v1/combos/1",
    body: {
      name: "Kaffee süß",
      items: [
        { food_id: 12, grams: 200 },
        { food_id: 11, grams: 5 },
      ],
    },
  });
  const chip = await screen.findByRole("button", { name: "Schnellzugriff Kaffee süß" });
  expect(calls.some((c) => c.method === "POST")).toBe(false); // nothing logged

  fireEvent.contextMenu(chip);
  fireEvent.click(await screen.findByRole("button", { name: "Löschen" }));
  fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
  await screen.findByText("Kaffee süß gelöscht");
  expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/v1/combos/1")).toBe(true);
  expect(screen.queryByRole("button", { name: /^Schnellzugriff/ })).not.toBeInTheDocument();
});

test("+ Neu creates a combo from searched foods; its chip stands first after + Neu", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Neuer Schnellzugriff" }));
  expect(await screen.findByRole("dialog", { name: "Schnellzugriff anlegen" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bananenpause" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Zutat suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "banane" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Banane roh/ }));
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

  await screen.findByText("Bananenpause als Schnellzugriff gespeichert");
  expect(calls.find((c) => c.method === "POST" && c.url === "/api/v1/combos")?.body).toEqual({
    name: "Bananenpause",
    items: [{ food_id: 7, grams: 120 }],
  });
  const chips = within(screen.getByRole("group", { name: "Zuletzt gegessen" })).getAllByRole("button");
  expect(chips[0]).toHaveAccessibleName("Neuer Schnellzugriff");
  expect(chips[1]).toHaveAccessibleName("Schnellzugriff Bananenpause");
  expect(calls.some((c) => c.url.endsWith("/log"))).toBe(false);
});

test("als Schnellzugriff merken creates a combo from a diary group", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await logPlate();
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  fireEvent.click(within(diary).getByRole("button", { name: "als Schnellzugriff merken" }));

  await screen.findByText("Hähnchen mit Reis und Brokkoli als Schnellzugriff gespeichert");
  expect(calls.find((c) => c.method === "POST" && c.url === "/api/v1/combos")?.body).toEqual({
    group_id: "group-200",
  });
  expect(screen.getByRole("button", { name: "Schnellzugriff Hähnchen mit Reis und Brokkoli" })).toBeInTheDocument();
  expect(within(diary).queryByRole("button", { name: "als Schnellzugriff merken" })).not.toBeInTheDocument();
});

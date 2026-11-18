import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { coffeeCombo, dishGroup, fakeApi, muesliDraft, PUDDING_CODE, puddingDraft } from "@/test/fixtures";
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
  await screen.findByText("Banane roh eingetragen · 112 kcal");
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
  await screen.findByText("Banane roh eingetragen · 112 kcal");
  fireEvent.click(await comboChip());
  await screen.findByText("Kaffee eingetragen · 24 kcal");
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  const rows = within(diary).getAllByRole("button", { name: /Banane roh|^Kaffee/ });
  // Both at the fake's time; the later one, the combo, stands first.
  expect(rows.map((row) => row.textContent?.slice(0, 6))).toEqual(["Kaffee", "Banane"]);
  expect(rows[1]).toHaveTextContent("10:05");
  // Entry and group show E, K and F the same way as the search: in this order, in colour.
  for (const row of rows) {
    const macros = within(row).getByTestId("macros");
    expect(macros).toHaveTextContent(/^E \d+K \d+F \d+$/);
    expect(within(macros).getByTitle("Eiweiß")).toHaveStyle({ color: "var(--biss-prot)" });
  }
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

test("an unknown product from Open Food Facts opens the amount sheet and is logged by GTIN", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Lebensmittel suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "Zippelmo" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Zippelmo Beerenmüsli/ }));

  expect(await screen.findByRole("heading", { name: "Zippelmo Beerenmüsli" })).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "Menge" })).toHaveValue(50);
  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 186 kcal" }));
  await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({ gtin: muesliDraft.gtin, grams: 50 });
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

/** The fake plate logged: the diary shows it as one entry of its dish. */
async function logPlate() {
  await photographPlate();
  fireEvent.click(await screen.findByRole("button", { name: "Eintragen · 399 kcal" }));
  return await screen.findByText("Hähnchen mit Reis und Brokkoli eingetragen · 399 kcal");
}

test("the plate photo opens the result sheet; Eintragen stores the dish with its photo and logs one portion", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await photographPlate();

  expect(await screen.findByText("Erkannt · bitte prüfen")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Kamera" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Gericht" })).toHaveValue("Hähnchen mit Reis und Brokkoli");

  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 399 kcal" }));
  await screen.findByText("Hähnchen mit Reis und Brokkoli eingetragen · 399 kcal");
  // The dish is stored as a recipe of one portion, gets the plate photo and is logged as
  // that portion: no grams and no meal, the backend takes its defaults (ADR-0003).
  const writes = calls.filter((c) => c.method === "POST" || c.method === "PUT").slice(1);
  expect(writes.map((c) => `${c.method} ${c.url}`)).toEqual([
    "POST /api/v1/recipes",
    "PUT /api/v1/foods/71/image",
    "POST /api/v1/entries",
  ]);
  expect(writes[0].body).toEqual({
    name: "Hähnchen mit Reis und Brokkoli",
    description: "",
    items: [
      { food_id: 9, grams: 120 },
      { food_id: 8, grams: 150 },
      { food_id: 10, grams: 80 },
    ],
    portions: 1,
    cooked_grams: null,
  });
  expect((writes[1].body as FormData).get("file")).toBeInstanceOf(File);
  expect(writes[2].body).toEqual({ food_id: 71 });
  expect(screen.queryByText("Erkannt · bitte prüfen")).not.toBeInTheDocument();

  // One row in the diary: the dish with its sum, not a group of ingredients.
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  const row = within(diary).getByRole("button", { name: /Hähnchen mit Reis und Brokkoli/ });
  expect(row).toHaveTextContent("399");
  expect(row).toHaveTextContent("350 g");
  expect(row).not.toHaveAttribute("aria-expanded");
  expect(within(diary).queryByText(/Zutaten/)).not.toBeInTheDocument();
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("399");

  // A tap opens the amount sheet: the portions can be counted, "Bearbeiten" opens the dish.
  fireEvent.click(row);
  expect(await screen.findByRole("heading", { name: "Hähnchen mit Reis und Brokkoli" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 Portion/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Bearbeiten" })).toBeInTheDocument();
});

test("Rückgängig after logging a plate removes its entry", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await logPlate();
  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));

  await waitFor(() => expect(screen.getByTestId("kcal-total")).toHaveTextContent("0"));
  expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual([
    expect.stringMatching(/^\/api\/v1\/entries\/\d+$/),
  ]);
});

test("a second try after a failed entry updates the stored dish instead of storing it twice", async () => {
  const { calls } = fakeApi();
  const fake = vi.mocked(fetch).getMockImplementation()!;
  let down = true;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (down && url === "/api/v1/entries" && init?.method === "POST") throw new TypeError("Failed to fetch");
    return fake(url, init);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<Home />);
  await photographPlate();
  fireEvent.click(await screen.findByRole("button", { name: "Eintragen · 399 kcal" }));
  expect(await screen.findByText("Das hat nicht geklappt. Verbindung prüfen.")).toBeInTheDocument();

  down = false;
  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 399 kcal" }));
  await screen.findByText("Hähnchen mit Reis und Brokkoli eingetragen · 399 kcal");
  expect(calls.filter((c) => c.url.startsWith("/api/v1/recipes")).map((c) => `${c.method} ${c.url}`)).toEqual([
    "POST /api/v1/recipes",
    "PATCH /api/v1/recipes/70",
  ]);
});

test("Speichern after Bearbeiten takes a new snapshot of the entry for the same grams", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: /Banane roh\s*120 g/ }));
  await screen.findByText("Banane roh eingetragen · 112 kcal");
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  fireEvent.click(within(diary).getByRole("button", { name: /Banane roh/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Bearbeiten" }));
  fireEvent.click(await screen.findByRole("button", { name: "Speichern" }));
  await screen.findByText("Lebensmittel gespeichert");
  fireEvent.click(await screen.findByRole("button", { name: /^Speichern · / }));

  await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.url.startsWith("/api/v1/entries/"))).toBe(true));
  expect(calls.find((c) => c.method === "PATCH" && c.url.startsWith("/api/v1/entries/"))?.body).toEqual({ grams: 120 });
});

test("Verwerfen closes the plate sheet and logs nothing", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await photographPlate();
  fireEvent.click(await screen.findByRole("button", { name: "Verwerfen" }));
  await waitFor(() => expect(screen.queryByText("Erkannt · bitte prüfen")).not.toBeInTheDocument());
  expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/v1/plates/extract"]);
});

test("a Schnellzugriff in the empty search is logged with one tap and closes the search", async () => {
  const { calls } = fakeApi({ combos: [coffeeCombo()] });
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Lebensmittel suchen" }));
  const recent = await screen.findByRole("group", { name: "Zuletzt" });
  fireEvent.click(within(recent).getByRole("button", { name: /^Kaffee/ }));

  await screen.findByText(/^Kaffee eingetragen · \d+ kcal$/);
  expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/v1/combos/1/log"]);
  expect(screen.queryByRole("textbox", { name: "Suchen" })).not.toBeInTheDocument();
});

test("the cookbook lists the recipes; a tap opens one to log portions", async () => {
  fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Meine Rezepte" }));
  const list = await screen.findByRole("list", { name: "Rezepte" });
  const row = within(list).getByRole("button", { name: /^Skyrbrötchen/ });
  expect(row).toHaveTextContent("5 Portionen · je 90 g");
  fireEvent.click(row);
  expect(await screen.findByRole("heading", { name: "Skyrbrötchen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 Portion/ })).toHaveAttribute("aria-pressed", "true");
});

test("the cookbook leads on to a new recipe; saved, its food opens to log portions", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Meine Rezepte" }));
  fireEvent.click(await screen.findByRole("button", { name: "+ Neues Rezept" }));

  expect(await screen.findByRole("heading", { name: "Neues Rezept" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Skyrbrötchen" } });
  fireEvent.click(screen.getByRole("button", { name: "Zutat suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "banane" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Banane roh/ }));
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

  // The amount sheet of the recipe's food, with its portion.
  expect(await screen.findByRole("heading", { name: "Skyrbrötchen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 Portion/ })).toHaveAttribute("aria-pressed", "true");
  expect(calls.some((c) => c.method === "POST" && c.url === "/api/v1/recipes")).toBe(true);

  // Bearbeiten opens the recipe again, not the food editor.
  fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
  expect(await screen.findByRole("textbox", { name: "Zubereitung" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Rezept bearbeiten" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(await screen.findByRole("heading", { name: "Skyrbrötchen" })).toBeInTheDocument();
});

test("the back button in the ingredient search goes back to the recipe; an unsaved one waits in the cookbook", async () => {
  fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Meine Rezepte" }));
  fireEvent.click(await screen.findByRole("button", { name: "+ Neues Rezept" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Name" }), { target: { value: "Linsensuppe" } });
  fireEvent.click(screen.getByRole("button", { name: "Zutat suchen" }));
  expect(screen.getByRole("textbox", { name: "Suchen" })).toBeInTheDocument();

  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Linsensuppe");

  // Closed from the recipe itself, it is not lost: the cookbook leads back to it.
  window.dispatchEvent(new PopStateEvent("popstate"));
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Meine Rezepte" }));
  fireEvent.click(await screen.findByRole("button", { name: /Nicht gespeichert\s*Linsensuppe/ }));
  expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Linsensuppe");
  window.localStorage.clear();
});

test("Aus Text oder Link in the cookbook opens the recipe sheet with the field for the text", async () => {
  fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Meine Rezepte" }));
  fireEvent.click(await screen.findByRole("button", { name: "Aus Text oder Link" }));
  expect(await screen.findByRole("heading", { name: "Neues Rezept" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Rezepttext oder Link" })).toHaveFocus();
});

test("the back button of the phone closes the open sheet", async () => {
  fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Lebensmittel suchen" }));
  expect(await screen.findByRole("textbox", { name: "Suchen" })).toBeInTheDocument();
  expect(window.history.state).toMatchObject({ biss: "overlay" });

  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.queryByRole("textbox", { name: "Suchen" })).not.toBeInTheDocument();
});

test("+ Zutat adds one more ingredient to a logged Gericht", async () => {
  const { calls } = fakeApi({ entries: dishGroup() });
  render(<Home />);
  const diary = await screen.findByRole("region", { name: "Tagebuch" });
  fireEvent.click(within(diary).getByRole("button", { name: /Hähnchen mit Reis und Brokkoli/ }));
  fireEvent.click(within(diary).getByRole("button", { name: "+ Zutat" }));

  // The search of an ingredient offers foods only, the last used right away.
  const recent = await screen.findByRole("group", { name: "Zuletzt" });
  fireEvent.click(within(recent).getByRole("button", { name: /^Banane roh/ }));
  fireEvent.click(await screen.findByRole("button", { name: /^Eintragen/ }));

  await waitFor(() =>
    expect(calls.filter((c) => c.method === "POST" && c.url === "/api/v1/entries").map((c) => c.body)).toEqual([
      { food_id: 7, group_id: "group-200", grams: 120 },
    ]),
  );
});

test("Gericht entfernen deletes the group; Rückgängig logs it again with name, meal, time and amounts", async () => {
  const { calls } = fakeApi({ entries: dishGroup() });
  render(<Home />);
  const diary = await screen.findByRole("region", { name: "Tagebuch" });
  fireEvent.click(within(diary).getByRole("button", { name: /Hähnchen mit Reis und Brokkoli/ }));
  fireEvent.click(within(diary).getByRole("button", { name: "Gericht entfernen" }));

  await screen.findByText("Hähnchen mit Reis und Brokkoli entfernt");
  expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["/api/v1/entries/group/group-200"]);
  expect(within(diary).queryByText(/3 Zutaten/)).not.toBeInTheDocument();
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("0");

  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
  await waitFor(() => expect(within(diary).getByText(/3 Zutaten/)).toBeInTheDocument());
  const posts = calls.filter((c) => c.method === "POST" && c.url === "/api/v1/entries/group");
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toEqual({
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
  const { calls } = fakeApi({ entries: dishGroup() });
  render(<Home />);
  const diary = await screen.findByRole("region", { name: "Tagebuch" });
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
  expect(await screen.findByRole("dialog", { name: "Neuer Schnellzugriff" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bananenpause" } });
  fireEvent.click(screen.getByRole("button", { name: "Zutat suchen" }));
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
  expect(chips[1]).toHaveAccessibleName("Meine Rezepte");
  // Never logged yet: it follows the used chips.
  expect(chips.at(-1)).toHaveAccessibleName("Schnellzugriff Bananenpause");
  expect(calls.some((c) => c.url.endsWith("/log"))).toBe(false);
});

test("als Schnellzugriff merken creates a combo from a diary group", async () => {
  const { calls } = fakeApi({ entries: dishGroup() });
  render(<Home />);
  const diary = await screen.findByRole("region", { name: "Tagebuch" });
  fireEvent.click(await within(diary).findByRole("button", { name: "als Schnellzugriff merken" }));

  await screen.findByText("Hähnchen mit Reis und Brokkoli als Schnellzugriff gespeichert");
  expect(calls.find((c) => c.method === "POST" && c.url === "/api/v1/combos")?.body).toEqual({
    group_id: "group-200",
  });
  expect(screen.getByRole("button", { name: "Schnellzugriff Hähnchen mit Reis und Brokkoli" })).toBeInTheDocument();
  expect(within(diary).queryByRole("button", { name: "als Schnellzugriff merken" })).not.toBeInTheDocument();
});

test("a failed tap says so instead of doing nothing", async () => {
  fakeApi();
  const fake = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (url === "/api/v1/entries" && init?.method === "POST") throw new TypeError("Failed to fetch");
    return fake(url, init);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<Home />);
  const chips = await screen.findByRole("group", { name: "Zuletzt gegessen" });
  fireEvent.click(await within(chips).findByRole("button", { name: /Banane roh\s*120 g/ }));
  expect(await screen.findByText("Das hat nicht geklappt. Verbindung prüfen.")).toBeInTheDocument();
});

test("without the backend the screen says so; Erneut versuchen loads the day", async () => {
  fakeApi();
  const fake = vi.mocked(fetch).getMockImplementation()!;
  let down = true;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (down) throw new TypeError("Failed to fetch");
    return fake(url, init);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<Home />);
  expect(await screen.findByText("BISS ist gerade nicht erreichbar.")).toBeInTheDocument();
  down = false;
  fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
  expect(await screen.findByText("Heute · Mi 28. Okt")).toBeInTheDocument();
  expect(screen.queryByText("BISS ist gerade nicht erreichbar.")).not.toBeInTheDocument();
});

test("back in front the page loads the day again", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await screen.findByText("Heute · Mi 28. Okt");
  const days = () => calls.filter((c) => c.url === "/api/v1/days/today").length;
  const before = days();
  fireEvent(document, new Event("visibilitychange")); // jsdom: the document is visible
  await waitFor(() => expect(days()).toBe(before + 1));
});

/** A speech recognition the test drives; the browser ends asynchronously after stop and abort. */
function fakeSpeech() {
  const instances: FakeRecognition[] = [];
  class FakeRecognition {
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    aborted = false;
    constructor() {
      instances.push(this);
    }
    start() {}
    stop() {
      setTimeout(() => this.onend?.());
    }
    abort() {
      this.aborted = true;
      setTimeout(() => {
        this.onerror?.({ error: "aborted" });
        this.onend?.();
      });
    }
    hear(text: string) {
      act(() => this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] }));
    }
    fail(error: string) {
      act(() => {
        this.onerror?.({ error });
        this.onend?.();
      });
    }
  }
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
  return instances;
}

const dictated = (calls: { method: string; url: string }[]) => calls.filter((c) => c.url === "/api/v1/plates/dictate");

test("a dictated meal opens the plate sheet without a photo; Eintragen logs the dish without uploading one", async () => {
  const speech = fakeSpeech();
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Mahlzeit diktieren" }));
  expect(screen.getByRole("heading", { name: "Ich höre zu" })).toBeInTheDocument();
  speech[0].hear("Hähnchen mit Reis und Brokkoli");
  expect(screen.getByTestId("heard")).toHaveTextContent("Hähnchen mit Reis und Brokkoli");

  fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
  expect(await screen.findByText("Erkannt · bitte prüfen")).toBeInTheDocument();
  expect(dictated(calls)).toEqual([
    { method: "POST", url: "/api/v1/plates/dictate", body: { text: "Hähnchen mit Reis und Brokkoli" } },
  ]);
  expect(within(screen.getByRole("list", { name: "Zutaten" })).getAllByRole("listitem")).toHaveLength(3);

  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 399 kcal" }));
  await screen.findByText("Hähnchen mit Reis und Brokkoli eingetragen · 399 kcal");
  const writes = calls.filter((c) => c.method === "POST" || c.method === "PUT").slice(1);
  expect(writes.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/v1/recipes", "POST /api/v1/entries"]);
});

test("closing the dictation sheet aborts the listening and sends nothing", async () => {
  const speech = fakeSpeech();
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Mahlzeit diktieren" }));
  speech[0].hear("ein Apfel");
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(screen.queryByRole("heading", { name: "Ich höre zu" })).not.toBeInTheDocument();
  expect(speech[0].aborted).toBe(true);
  await new Promise((resolve) => setTimeout(resolve));
  expect(dictated(calls)).toEqual([]);
  expect(screen.queryByText("Erkannt · bitte prüfen")).not.toBeInTheDocument();
});

test("a blocked microphone says so and sends nothing", async () => {
  const speech = fakeSpeech();
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Mahlzeit diktieren" }));
  speech[0].fail("not-allowed");
  expect(screen.getByText("Das Mikrofon ist aus. Erlaube es im Browser.")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Ich höre zu" })).not.toBeInTheDocument();
  expect(dictated(calls)).toEqual([]);
});

test("a sentence without food says so instead of opening an empty sheet", async () => {
  const speech = fakeSpeech();
  fakeApi();
  const fake = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) =>
    url === "/api/v1/plates/dictate"
      ? new Response(JSON.stringify({ dish: "", items: [], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, notes: "Kein Essen genannt.", model: "m", attempts: 2 }))
      : fake(url, init),
  );
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Mahlzeit diktieren" }));
  speech[0].hear("äh");
  fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
  expect(await screen.findByText("Kein Essen genannt.")).toBeInTheDocument();
  expect(screen.queryByText("Erkannt · bitte prüfen")).not.toBeInTheDocument();
});

test("without speech recognition in the browser there is no microphone", async () => {
  fakeApi();
  render(<Home />);
  expect(await screen.findByRole("button", { name: /^Kamera/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mahlzeit diktieren" })).not.toBeInTheDocument();
});

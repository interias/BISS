import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Sheet } from "@/components/sheet";
import { banana, broccoli, fakeApi, fakePlate, riceDetail } from "@/test/fixtures";
import { PlateSheet } from "./plate-sheet";

afterEach(() => vi.unstubAllGlobals());

// The sheet's title needs the dialog around it, as in the app.

/** The grams field of an ingredient, labelled by its name from the backend. */
const grams = (name: string) => screen.getByRole("spinbutton", { name: `${name} Gramm` });

function renderSheet(plate = fakePlate(), recent = [banana, riceDetail]) {
  const onSubmit = vi.fn();
  const onDiscard = vi.fn();
  render(
    <Sheet onClose={() => {}}>
      <PlateSheet plate={plate} recent={recent} onSubmit={onSubmit} onDiscard={onDiscard} />
    </Sheet>,
  );
  return { onSubmit, onDiscard };
}

test("shows the dish, each ingredient with erkannt or vermutet and the sum as the button", () => {
  renderSheet();
  expect(screen.getByText("Erkannt · bitte prüfen")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Gericht" })).toHaveValue("Hähnchen mit Reis und Brokkoli");
  const rows = within(screen.getByRole("list", { name: "Zutaten" })).getAllByRole("listitem");
  expect(rows).toHaveLength(3);
  expect(within(rows[0]).getByText("Hähnchen Brustfilet, gegrillt")).toBeInTheDocument();
  expect(within(rows[0]).getByText("erkannt")).toBeInTheDocument();
  expect(within(rows[1]).getByText("erkannt")).toBeInTheDocument();
  expect(within(rows[2]).getByText("vermutet")).toBeInTheDocument(); // confidence 0.6, from the backend
  expect(within(rows[0]).getByRole("spinbutton")).toHaveValue(120);
  expect(screen.getByText("Mengen sind geschätzt. Fehlt etwas?")).toBeInTheDocument();
  // 150 · 1.2 + 130 · 1.5 + 30 · 0.8 = 180 + 195 + 24
  expect(screen.getByRole("button", { name: "Eintragen · 399 kcal" })).toBeInTheDocument();
  expect(screen.queryByText("Nicht zugeordnete Zutaten werden nicht eingetragen.")).not.toBeInTheDocument();
});

test("an ml ingredient previews through its density, as the backend computes it", () => {
  const plate = fakePlate();
  // 206 g of a drink with 64 kcal per 100 ml and 1.03 g/ml: 200 ml, 128 kcal (not 131.84).
  plate.items = [
    {
      ...plate.items[0],
      name: "Testmilch",
      grams: 206,
      basis: "ml",
      density: 1.03,
      per_100: { kcal: 64, protein: 3.3, carbs: 4.8, fat: 3.5 },
      macros: { kcal: 128, protein: 6.6, carbs: 9.6, fat: 7 },
    },
  ];
  renderSheet(plate, []);
  expect(screen.getByRole("button", { name: "Eintragen · 128 kcal" })).toBeInTheDocument();
});

test("the sheet opens without focus on the name, so no keyboard comes up on the phone", () => {
  renderSheet();
  const name = screen.getByRole("textbox", { name: "Gericht" });
  expect(document.activeElement).not.toBe(name);
  expect(screen.getByRole("dialog")).toHaveFocus();
});

test("plus and minus change an amount by 10 g, never below 5 g, and the sum follows", () => {
  renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "Reis gekocht mehr" }));
  expect(grams("Reis gekocht")).toHaveValue(160);
  expect(screen.getByRole("button", { name: "Eintragen · 412 kcal" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reis gekocht weniger" }));
  fireEvent.click(screen.getByRole("button", { name: "Reis gekocht weniger" }));
  expect(grams("Reis gekocht")).toHaveValue(140);

  for (let i = 0; i < 9; i++) fireEvent.click(screen.getByRole("button", { name: "Broccoli gekocht weniger" }));
  expect(grams("Broccoli gekocht")).toHaveValue(5); // 80 → 5, not below
});

test("the name is editable and an ingredient can be removed", () => {
  const { onSubmit } = renderSheet();
  fireEvent.change(screen.getByRole("textbox", { name: "Gericht" }), { target: { value: "Reispfanne" } });
  fireEvent.click(screen.getByRole("button", { name: "Broccoli gekocht entfernen" }));
  expect(screen.queryByText("Broccoli gekocht")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Eintragen · 375 kcal$/ }));
  expect(onSubmit).toHaveBeenCalledWith("Reispfanne", [
    { food_id: 9, grams: 120 },
    { food_id: 8, grams: 150 },
  ]);
});

test("suggestions are the recent foods not yet on the plate; a tap adds one with its standard serving", () => {
  renderSheet();
  const suggestions = screen.getByRole("group", { name: "Vorschläge" });
  // Rice is on the plate already.
  expect(within(suggestions).queryByText("+ Reis gekocht")).not.toBeInTheDocument();
  fireEvent.click(within(suggestions).getByRole("button", { name: "+ Banane roh" }));

  const added = screen.getByRole("button", { name: "Banane roh entfernen" }).closest("li")!;
  expect(within(added).getByRole("spinbutton")).toHaveValue(120);
  expect(within(added).getByText("manuell")).toBeInTheDocument();
  // No recent food is left, the search stays.
  expect(within(suggestions).getAllByRole("button").map((button) => button.textContent)).toEqual(["+ Zutat suchen"]);
  expect(screen.getByRole("button", { name: "Eintragen · 511 kcal" })).toBeInTheDocument(); // + 93 · 1.2
});

test("Verwerfen discards", () => {
  const { onDiscard, onSubmit } = renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
  expect(onDiscard).toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("an unmatched ingredient is marked, not logged and has no kcal", () => {
  const { onSubmit } = renderSheet(fakePlate(false));
  const row = screen.getByRole("button", { name: "Broccoli gekocht entfernen" }).closest("li")!;
  expect(row).toHaveAttribute("data-matched", "false");
  expect(within(row).getByText("nicht zugeordnet")).toBeInTheDocument();
  expect(screen.getByText("Nicht zugeordnete Zutaten werden nicht eingetragen.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Eintragen · 375 kcal" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 375 kcal" }));
  expect(onSubmit).toHaveBeenCalledWith("Hähnchen mit Reis und Brokkoli", [
    { food_id: 9, grams: 120 },
    { food_id: 8, grams: 150 },
  ]);
});

test("an unmatched ingredient is removed with the cross; the note goes with it", () => {
  renderSheet(fakePlate(false));
  fireEvent.click(screen.getByRole("button", { name: "Broccoli gekocht entfernen" }));
  expect(screen.queryByText("nicht zugeordnet")).not.toBeInTheDocument();
  expect(screen.queryByText("Nicht zugeordnete Zutaten werden nicht eingetragen.")).not.toBeInTheDocument();
});

test("zuordnen searches foods and the hit takes the row, the grams stay", async () => {
  fakeApi();
  const { onSubmit } = renderSheet(fakePlate(false));
  fireEvent.click(screen.getByRole("button", { name: "Broccoli gekocht zuordnen" }));
  fireEvent.click(screen.getByRole("button", { name: "← Zurück zum Gericht" })); // back leaves the row as it was
  expect(screen.getByText("nicht zugeordnet")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Broccoli gekocht zuordnen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "brokkoli" } });
  // A product of the Open Food Facts cache has no food and does not stand in the hits.
  const hit = await screen.findByRole("button", { name: /^Broccoli gekocht/ });
  expect(screen.queryByRole("button", { name: /Testpudding/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Neu anlegen" })).not.toBeInTheDocument();
  fireEvent.click(hit);

  const row = await screen.findByRole("button", { name: "Broccoli gekocht entfernen" });
  expect(within(row.closest("li")!).getByRole("spinbutton")).toHaveValue(80);
  expect(within(row.closest("li")!).getByText("manuell")).toBeInTheDocument();
  expect(screen.queryByText("nicht zugeordnet")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Eintragen · 399 kcal" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 399 kcal" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onSubmit.mock.calls[0][1]).toContainEqual({ food_id: broccoli.id, grams: 80 });
});

test("Eintragen is off without a name or without a matched ingredient", () => {
  renderSheet(fakePlate(false));
  fireEvent.change(screen.getByRole("textbox", { name: "Gericht" }), { target: { value: "  " } });
  expect(screen.getByRole("button", { name: /^Eintragen/ })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Gericht" }), { target: { value: "Reis" } });
  expect(screen.getByRole("button", { name: /^Eintragen/ })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Hähnchen Brustfilet, gegrillt entfernen" }));
  fireEvent.click(screen.getByRole("button", { name: "Reis gekocht entfernen" }));
  expect(screen.getByRole("button", { name: /^Eintragen/ })).toBeDisabled();
});

test("grams can be typed; on leaving the field they stay between 5 and 1500 g", () => {
  const { onSubmit } = renderSheet();
  fireEvent.change(grams("Reis gekocht"), { target: { value: "200" } });
  // 150 · 1.2 + 200 · 1.3 + 30 · 0.8 = 180 + 260 + 24
  expect(screen.getByRole("button", { name: "Eintragen · 464 kcal" })).toBeInTheDocument();
  fireEvent.change(grams("Broccoli gekocht"), { target: { value: "" } });
  expect(grams("Broccoli gekocht")).toHaveValue(null);
  fireEvent.blur(grams("Broccoli gekocht"));
  expect(grams("Broccoli gekocht")).toHaveValue(5);
  fireEvent.change(grams("Hähnchen Brustfilet, gegrillt"), { target: { value: "4000" } });
  fireEvent.click(screen.getByRole("button", { name: /^Eintragen/ }));
  expect(onSubmit.mock.calls[0][1]).toContainEqual({ food_id: 9, grams: 1500 });
});

test("tauschen replaces a recognised ingredient with a search hit, the grams stay", async () => {
  fakeApi();
  renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "Reis gekocht tauschen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "brokkoli" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Broccoli gekocht/ }));

  const row = (await screen.findByRole("button", { name: "Reis gekocht entfernen" })).closest("li")!;
  expect(within(row).getByText("Broccoli gekocht")).toBeInTheDocument();
  expect(within(row).getByText("manuell")).toBeInTheDocument();
  expect(within(row).getByRole("spinbutton")).toHaveValue(150);
});

test("Zutat suchen adds a search hit with its standard serving", async () => {
  fakeApi();
  renderSheet(fakePlate(), []);
  fireEvent.click(screen.getByRole("button", { name: "+ Zutat suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "banane" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Banane roh/ }));

  const rows = within(await screen.findByRole("list", { name: "Zutaten" })).getAllByRole("listitem");
  expect(rows).toHaveLength(4);
  expect(within(rows[3]).getByText("Banane roh")).toBeInTheDocument();
  expect(within(rows[3]).getByRole("spinbutton")).toHaveValue(banana.standard_serving.grams);
});

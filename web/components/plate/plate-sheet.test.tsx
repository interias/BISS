import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Sheet } from "@/components/sheet";
import { banana, broccoli, fakeApi, fakePlate, riceDetail } from "@/test/fixtures";
import { PlateSheet } from "./plate-sheet";

afterEach(() => vi.unstubAllGlobals());

// The sheet's title needs the dialog around it, as in the app.

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
  expect(within(rows[0]).getByText("120 g")).toBeInTheDocument();
  expect(screen.getByText("Mengen sind geschätzt. Fehlt etwas?")).toBeInTheDocument();
  // 150 · 1.2 + 130 · 1.5 + 30 · 0.8 = 180 + 195 + 24
  expect(screen.getByRole("button", { name: "Eintragen · 399 kcal" })).toBeInTheDocument();
  expect(screen.queryByText("Nicht zugeordnete Zutaten werden nicht eingetragen.")).not.toBeInTheDocument();
});

test("plus and minus change an amount by 10 g, never below 5 g, and the sum follows", () => {
  renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "Reis gekocht mehr" }));
  expect(screen.getByText("160 g")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Eintragen · 412 kcal" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reis gekocht weniger" }));
  fireEvent.click(screen.getByRole("button", { name: "Reis gekocht weniger" }));
  expect(screen.getByText("140 g")).toBeInTheDocument();

  for (let i = 0; i < 9; i++) fireEvent.click(screen.getByRole("button", { name: "Broccoli gekocht weniger" }));
  expect(screen.getByText("5 g")).toBeInTheDocument(); // 80 → 5, not below
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
  expect(within(added).getByText("120 g")).toBeInTheDocument();
  expect(within(added).getByText("manuell")).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Vorschläge" })).not.toBeInTheDocument(); // nothing left
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
  expect(within(row.closest("li")!).getByText("80 g")).toBeInTheDocument();
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

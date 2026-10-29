import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Combo } from "@/lib/api";
import { Sheet } from "@/components/sheet";
import { banana, coffeeCombo, fakeApi, riceDetail, sugar } from "@/test/fixtures";
import { ComboSheet } from "./combo-sheet";

afterEach(() => vi.unstubAllGlobals());

const grams = (name: string) => screen.getByRole("spinbutton", { name: `${name} Gramm` });
const rows = () => within(screen.getByRole("list", { name: "Zutaten" })).getAllByRole("listitem");

function renderSheet(combo?: Combo, recent = [banana, riceDetail]) {
  const actions = { onLog: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(), onCancel: vi.fn() };
  render(
    <Sheet onClose={() => {}}>
      <ComboSheet
        combo={combo}
        suggestedMeal="breakfast"
        recent={recent}
        {...actions}
        onLog={combo && actions.onLog}
        onDelete={combo && actions.onDelete}
      />
    </Sheet>,
  );
  return actions;
}

test("adjust shows the items with grams, the suggested meal and the sum as the button", () => {
  renderSheet(coffeeCombo());
  expect(screen.getByRole("dialog", { name: "Schnellzugriff anpassen" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Kaffee");
  expect(screen.getByText("Gilt nur für diesen Eintrag. Die Vorlage bleibt, außer du speicherst sie.")).toBeInTheDocument();
  expect(rows()).toHaveLength(2);
  expect(within(rows()[0]).getByText("Kaffee, Filter")).toBeInTheDocument();
  expect(within(rows()[0]).getByText("4 kcal")).toBeInTheDocument();
  expect(grams("Zucker")).toHaveValue(5);
  expect(screen.getByRole("button", { name: "Frühstück" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Eintragen · 24 kcal" })).toBeInTheDocument();
});

test("Eintragen logs the adjusted items with the chosen meal, never the template", () => {
  const { onLog, onSave } = renderSheet(coffeeCombo());
  fireEvent.click(screen.getByRole("button", { name: "Zucker mehr" })); // 15 g: +40 kcal
  fireEvent.click(screen.getByRole("button", { name: "Snack" }));
  expect(screen.getByRole("button", { name: "Snack" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Eintragen · 64 kcal" }));
  expect(onLog).toHaveBeenCalledWith(
    [
      { food_id: 12, grams: 200 },
      { food_id: 11, grams: 15 },
    ],
    "snack",
  );
  expect(onSave).not.toHaveBeenCalled();
});

test("typed grams stay within 5 to 1500 g, ✕ removes an item", () => {
  const { onLog } = renderSheet(coffeeCombo());
  fireEvent.change(grams("Zucker"), { target: { value: "2000" } });
  fireEvent.blur(grams("Zucker"));
  expect(grams("Zucker")).toHaveValue(1500);
  fireEvent.click(screen.getByRole("button", { name: "Kaffee, Filter entfernen" }));
  expect(rows()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /^Eintragen · / }));
  expect(onLog).toHaveBeenCalledWith([{ food_id: 11, grams: 1500 }], "breakfast");
});

test("tauschen and + Zutat suchen pick a food from the search", async () => {
  fakeApi();
  renderSheet(coffeeCombo());
  fireEvent.click(screen.getByRole("button", { name: "Zucker tauschen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "banane" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Banane roh/ }));
  expect(within(rows()[1]).getByText("Banane roh")).toBeInTheDocument();
  expect(grams("Banane roh")).toHaveValue(5); // the amount stays, only the food changes

  fireEvent.click(screen.getByRole("button", { name: "+ Zutat suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "banane" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Banane roh/ }));
  expect(rows()).toHaveLength(3);
  expect(within(rows()[2]).getByRole("spinbutton")).toHaveValue(120); // its standard serving
});

test("Als Vorlage speichern sends the name and the current items", () => {
  const { onSave, onLog } = renderSheet(coffeeCombo());
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: " Kaffee süß " } });
  fireEvent.click(screen.getByRole("button", { name: "Zucker mehr" }));
  fireEvent.click(screen.getByRole("button", { name: "Als Vorlage speichern" }));
  expect(onSave).toHaveBeenCalledWith("Kaffee süß", [
    { food_id: 12, grams: 200 },
    { food_id: 11, grams: 15 },
  ]);
  expect(onLog).not.toHaveBeenCalled();
});

test("Löschen asks inline first; Behalten keeps the combo", () => {
  const { onDelete } = renderSheet(coffeeCombo());
  fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
  expect(onDelete).not.toHaveBeenCalled();
  const confirm = screen.getByRole("group", { name: "Löschen bestätigen" });
  expect(within(confirm).getByText("„Kaffee“ löschen?")).toBeInTheDocument();
  fireEvent.click(within(confirm).getByRole("button", { name: "Behalten" }));
  expect(screen.queryByRole("group", { name: "Löschen bestätigen" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
  fireEvent.click(screen.getByRole("button", { name: "Ja, löschen" }));
  expect(onDelete).toHaveBeenCalledTimes(1);
});

test("create needs a name and an item; suggestions add a recent food with its serving", () => {
  const { onSave, onCancel } = renderSheet(undefined, [banana, sugar]);
  expect(screen.getByRole("dialog", { name: "Schnellzugriff anlegen" })).toBeInTheDocument();
  expect(screen.getByText("Noch keine Zutat.")).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Mahlzeit" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Löschen" })).not.toBeInTheDocument();
  const save = screen.getByRole("button", { name: "Speichern" });
  expect(save).toBeDisabled();

  const suggestions = screen.getByRole("group", { name: "Vorschläge" });
  fireEvent.click(within(suggestions).getByRole("button", { name: "+ Zucker" }));
  expect(within(suggestions).queryByRole("button", { name: "+ Zucker" })).not.toBeInTheDocument();
  expect(save).toBeDisabled(); // still without a name
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Süßes" } });
  fireEvent.click(save);
  expect(onSave).toHaveBeenCalledWith("Süßes", [{ food_id: 11, grams: 5 }]);

  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(onCancel).toHaveBeenCalled();
});

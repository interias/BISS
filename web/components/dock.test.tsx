import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { banana, coffeeCombo } from "@/test/fixtures";
import { Dock, HOLD_MS } from "./dock";

afterEach(() => vi.useRealTimers());

function renderDock() {
  const actions = {
    onCombo: vi.fn(),
    onComboHold: vi.fn(),
    onNewCombo: vi.fn(),
    onRecent: vi.fn(),
    onSearch: vi.fn(),
    onCamera: vi.fn(),
  };
  render(<Dock combos={[coffeeCombo()]} recent={[banana]} {...actions} />);
  return { ...actions, chip: screen.getByRole("button", { name: "Schnellzugriff Kaffee" }) };
}

test("+ Neu stands first, then the combo chips and the recent ones", () => {
  const { onNewCombo } = renderDock();
  const chips = within(screen.getByRole("group", { name: "Zuletzt gegessen" })).getAllByRole("button");
  expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
    "Neuer Schnellzugriff",
    "Schnellzugriff Kaffee",
    "Banane roh 120 g",
  ]);
  fireEvent.click(chips[0]);
  expect(onNewCombo).toHaveBeenCalled();
});

test("a chip shows the name above grams and kcal", () => {
  const { chip } = renderDock();
  // The combo: 200 g coffee and 5 g sugar, 24 kcal.
  expect(chip).toHaveTextContent("Kaffee205 g · 24 kcal");
  const recent = screen.getByRole("button", { name: "Banane roh 120 g" });
  expect(recent).toHaveTextContent("Banane roh120 g · 112 kcal");
});

test("long names are cut to about 14 characters, the full name stays in the label", () => {
  const long = { ...coffeeCombo(), name: "Frühstücksmüsli mit Joghurt" };
  const food = { ...banana, name: "Vollkornhaferflocken extra zart, roh" };
  render(
    <Dock
      combos={[long]}
      recent={[food]}
      onCombo={vi.fn()}
      onComboHold={vi.fn()}
      onNewCombo={vi.fn()}
      onRecent={vi.fn()}
      onSearch={vi.fn()}
      onCamera={vi.fn()}
    />,
  );
  const combo = screen.getByRole("button", { name: "Schnellzugriff Frühstücksmüsli mit Joghurt" });
  expect(combo).toHaveTextContent(/^Frühstücksmüs…\d/);
  expect(combo).toHaveAttribute("title", "Frühstücksmüsli mit Joghurt");
  const chip = screen.getByRole("button", { name: "Vollkornhaferflocken extra zart 120 g" });
  expect(chip).toHaveTextContent(/^Vollkornhafer…\d/);
});

test("a short press logs the combo", () => {
  vi.useFakeTimers();
  const { chip, onCombo, onComboHold } = renderDock();
  fireEvent.pointerDown(chip);
  vi.advanceTimersByTime(HOLD_MS - 100);
  fireEvent.pointerUp(chip);
  fireEvent.click(chip, { detail: 1 });
  vi.advanceTimersByTime(HOLD_MS);
  expect(onCombo).toHaveBeenCalledWith(coffeeCombo());
  expect(onComboHold).not.toHaveBeenCalled();
});

test("a long press opens the combo and the click that ends it logs nothing", () => {
  vi.useFakeTimers();
  const { chip, onCombo, onComboHold } = renderDock();
  fireEvent.pointerDown(chip);
  vi.advanceTimersByTime(HOLD_MS);
  expect(onComboHold).toHaveBeenCalledTimes(1);
  // On a phone the long press also brings the context menu; it opens nothing twice.
  fireEvent.contextMenu(chip);
  fireEvent.pointerUp(chip);
  fireEvent.click(chip, { detail: 1 });
  expect(onComboHold).toHaveBeenCalledTimes(1);
  expect(onCombo).not.toHaveBeenCalled();

  fireEvent.pointerDown(chip); // the next tap logs again
  fireEvent.pointerUp(chip);
  fireEvent.click(chip, { detail: 1 });
  expect(onCombo).toHaveBeenCalledTimes(1);
});

test("the context menu opens the combo, moving away cancels a press", () => {
  vi.useFakeTimers();
  const { chip, onCombo, onComboHold } = renderDock();
  fireEvent.pointerDown(chip);
  fireEvent.pointerCancel(chip); // e.g. the chip row scrolls
  vi.advanceTimersByTime(HOLD_MS);
  expect(onComboHold).not.toHaveBeenCalled();

  expect(fireEvent.contextMenu(chip)).toBe(false); // no browser menu
  expect(onComboHold).toHaveBeenCalledTimes(1);
  fireEvent.contextMenu(chip); // a later one opens it again
  expect(onComboHold).toHaveBeenCalledTimes(2);
  expect(onCombo).not.toHaveBeenCalled();
});

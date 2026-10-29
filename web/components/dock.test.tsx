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

test("the combo chips stand first, + Neu last", () => {
  const { onNewCombo } = renderDock();
  const chips = within(screen.getByRole("group", { name: "Zuletzt gegessen" })).getAllByRole("button");
  expect(chips.map((chip) => chip.getAttribute("aria-label") ?? chip.textContent)).toEqual([
    "Schnellzugriff Kaffee",
    "Banane roh120 g",
    "Neuer Schnellzugriff",
  ]);
  fireEvent.click(chips[2]);
  expect(onNewCombo).toHaveBeenCalled();
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

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { Sheet } from "@/components/sheet";
import { DictationSheet } from "./dictation-sheet";

const renderSheet = (heard: string, reading: boolean, onStop = vi.fn()) => {
  render(
    <Sheet onClose={() => {}}>
      <DictationSheet heard={heard} reading={reading} onStop={onStop} />
    </Sheet>,
  );
  return onStop;
};

test("while listening it shows what is heard and Fertig ends it", () => {
  const onStop = renderSheet("ein Apfel", false);
  expect(screen.getByRole("heading", { name: "Ich höre zu" })).toBeInTheDocument();
  expect(screen.getByTestId("heard")).toHaveTextContent("ein Apfel");
  fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
  expect(onStop).toHaveBeenCalled();
});

test("before anything is heard an example stands in its place", () => {
  renderSheet("", false);
  expect(screen.getByTestId("heard")).toHaveTextContent("„Zwei Scheiben Brot mit Käse und ein Kaffee“");
});

test("while the backend reads, the sentence stays and there is nothing to tap", () => {
  renderSheet("ein Apfel", true);
  expect(screen.getByRole("heading", { name: "Erkenne Gericht …" })).toBeInTheDocument();
  expect(screen.getByTestId("heard")).toHaveTextContent("ein Apfel");
  expect(screen.queryByRole("button", { name: "Fertig" })).not.toBeInTheDocument();
});

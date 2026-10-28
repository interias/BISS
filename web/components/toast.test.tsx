import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Toast, useToast } from "./toast";

function Harness({ onUndo }: { onUndo?: () => void }) {
  const { toast, show, hide } = useToast();
  return (
    <>
      <button onClick={() => show("Banane eingetragen", onUndo)}>show</button>
      <Toast toast={toast} onHide={hide} />
    </>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("shows the toast with Rückgängig for 3 s", () => {
  render(<Harness onUndo={() => {}} />);
  fireEvent.click(screen.getByText("show"));
  expect(screen.getByRole("status")).toHaveTextContent("Banane eingetragen");
  expect(screen.getByRole("button", { name: "Rückgängig" })).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(2999));
  expect(screen.getByRole("status")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("Rückgängig calls the undo and hides the toast", () => {
  const onUndo = vi.fn();
  render(<Harness onUndo={onUndo} />);
  fireEvent.click(screen.getByText("show"));
  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
  expect(onUndo).toHaveBeenCalledOnce();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("a new toast restarts the 3 s", () => {
  render(<Harness />);
  fireEvent.click(screen.getByText("show"));
  act(() => vi.advanceTimersByTime(2000));
  fireEvent.click(screen.getByText("show"));
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Rückgängig" })).not.toBeInTheDocument();
});

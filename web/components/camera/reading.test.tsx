import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { QUIP_MS, Reading } from "./reading";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("shows an animation and a quip that changes every two seconds", () => {
  render(<Reading kind="plate" />);
  expect(screen.getByTestId("reading").querySelector("svg")).not.toBeNull();
  const seen = [screen.getByTestId("quip").textContent];
  for (let step = 0; step < 3; step++) {
    act(() => vi.advanceTimersByTime(QUIP_MS));
    const quip = screen.getByTestId("quip").textContent;
    // Never the same quip twice in a row.
    expect(quip).not.toBe(seen.at(-1));
    expect(quip).toMatch(/ …$/);
    seen.push(quip);
  }
});

test("a label has its own quips", () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  render(<Reading kind="label" />);
  expect(screen.getByTestId("quip")).toHaveTextContent("Entziffere das Kleingedruckte …");
  vi.restoreAllMocks();
});

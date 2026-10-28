import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { barWidth, DaySummary, ringDash } from "./day-summary";

const C = 2 * Math.PI * 56;

describe("ring and bar values", () => {
  test("the arc covers the eaten share of the kcal goal", () => {
    expect(ringDash(600, 2400)).toBe(`${C / 4} ${C}`);
    expect(ringDash(0, 2400)).toBe(`0 ${C}`);
  });

  test("the arc and the bars stop at the goal", () => {
    expect(ringDash(3000, 2400)).toBe(`${C} ${C}`);
    expect(barWidth(200, 160)).toBe("100%");
  });

  test("a bar shows the share in percent", () => {
    expect(barWidth(40, 160)).toBe("25%");
    expect(barWidth(10, 0)).toBe("0%");
  });
});

test("shows kcal against the goal and Ist/Soll in g for the three macros", async () => {
  render(
    <DaySummary
      totals={{ kcal: 1234.6, protein: 80.4, carbs: 130, fat: 37.5 }}
      targets={{ kcal: 2400, protein: 160, carbs: 260, fat: 75 }}
    />,
  );
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("1.235");
  expect(screen.getByText("von 2.400 kcal")).toBeInTheDocument();
  const protein = screen.getByTestId("macro-protein");
  expect(protein).toHaveTextContent("Eiweiß");
  expect(protein).toHaveTextContent("80 / 160 g");
  const carbs = screen.getByTestId("macro-carbs");
  expect(carbs).toHaveTextContent("Kohlenhydrate130 / 260 g");
  expect(carbs.querySelector("i")).toHaveStyle({ width: "50%" });
  expect(screen.getByTestId("macro-fat")).toHaveTextContent("Fett38 / 75 g");

  // The arc starts empty and fills after the first frame (animated by CSS).
  const arc = screen.getByTestId("ring-arc");
  await waitFor(() =>
    expect(arc).toHaveAttribute("stroke-dasharray", ringDash(1234.6, 2400)),
  );
  expect(arc).toHaveClass("biss-ring-arc");
});

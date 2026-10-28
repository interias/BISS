import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("renders the empty page", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: "BISS" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("bg-card");
});

import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { fakeApi } from "@/test/fixtures";
import Page from "./page";

afterEach(() => vi.unstubAllGlobals());

test("renders the main screen", async () => {
  fakeApi();
  render(<Page />);
  expect(screen.getByRole("heading", { level: 1, name: "BISS" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveClass("bg-card");
  expect(await screen.findByRole("region", { name: "Tagesbilanz" })).toBeInTheDocument();
});

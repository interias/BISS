import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { fakeApi } from "@/test/fixtures";
import { Home } from "./home";

afterEach(() => vi.unstubAllGlobals());

test("shows the header date of the backend's day and the four meals", async () => {
  fakeApi();
  render(<Home />);
  expect(await screen.findByText("Heute · Mi 28. Okt")).toBeInTheDocument();
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  for (const meal of ["Frühstück", "Mittag", "Snack", "Abend"]) {
    expect(within(diary).getByText(meal)).toBeInTheDocument();
  }
  expect(within(diary).getAllByText("Noch nichts eingetragen")).toHaveLength(4);
  expect(screen.getByRole("button", { name: "Lebensmittel suchen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Kamera/ })).toBeInTheDocument();
});

test("a recent chip sends only the food, Rückgängig deletes the new entry", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  const chips = await screen.findByRole("group", { name: "Zuletzt gegessen" });
  fireEvent.click(await within(chips).findByRole("button", { name: /Banane roh\s*120 g/ }));

  // ADR-0003: no grams, no meal; the backend picks the standard serving and the meal.
  await screen.findByText("Banane roh eingetragen");
  const post = calls.find((c) => c.method === "POST");
  expect(post).toEqual({ method: "POST", url: "/api/v1/entries", body: { food_id: 7 } });
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  expect(within(diary).getByText("Banane roh")).toBeInTheDocument();
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("112");

  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
  await waitFor(() => expect(within(diary).queryByText("Banane roh")).not.toBeInTheDocument());
  expect(calls.some((c) => c.method === "DELETE" && c.url.startsWith("/api/v1/entries/"))).toBe(true);
  expect(screen.getByTestId("kcal-total")).toHaveTextContent("0");
});

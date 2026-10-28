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

async function openAmountOfBanana() {
  fireEvent.click(await screen.findByRole("button", { name: "Lebensmittel suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "banane" } });
  fireEvent.click(await screen.findByRole("button", { name: /^Banane roh/ }));
  await screen.findByRole("heading", { name: "Banane roh" });
}

test("Bearbeiten opens the editor and Abbrechen returns with the same grams and meal", async () => {
  fakeApi();
  render(<Home />);
  await openAmountOfBanana();
  fireEvent.click(screen.getByRole("button", { name: "mehr" })); // 130 g
  fireEvent.click(screen.getByRole("button", { name: /^Mahlzeit/ })); // snack → Abend
  fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));

  expect(await screen.findByLabelText("Name")).toHaveValue("Banane roh");
  expect(screen.queryByRole("status", { name: "Menge" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

  expect(await screen.findByRole("status", { name: "Menge" })).toHaveTextContent("130g");
  expect(screen.getByRole("button", { name: "Mahlzeit: Abend" })).toBeInTheDocument();
});

test("saving in the editor returns to the amount sheet with the new name", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  await openAmountOfBanana();
  fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Banane, reif" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

  expect(await screen.findByRole("heading", { name: "Banane, reif" })).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Menge" })).toHaveTextContent("120g");
  expect(await screen.findByText("Lebensmittel gespeichert")).toBeInTheDocument();
  expect(calls.some((c) => c.method === "PATCH" && c.url === "/api/v1/foods/7")).toBe(true);
});

test("an empty search offers Neu anlegen; Speichern & eintragen leads into the amount sheet", async () => {
  fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Lebensmittel suchen" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "xyz" } });
  fireEvent.click(await screen.findByRole("button", { name: "Neu anlegen" }));

  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Skyr" } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern & eintragen" }));
  expect(await screen.findByRole("heading", { name: "Skyr" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Eintragen · / })).toBeInTheDocument();
});

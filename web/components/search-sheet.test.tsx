import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Sheet } from "@/components/sheet";
import type { Combo } from "@/lib/api";
import { banana, coffeeCombo, fakeApi, muesliHit } from "@/test/fixtures";
import { SearchSheet } from "./search-sheet";

afterEach(() => vi.unstubAllGlobals());

function renderSearch(props: { foodsOnly?: boolean; onCreate?: () => void; onCombo?: (combo: Combo) => void } = {}) {
  const onPick = vi.fn();
  render(
    <Sheet onClose={() => {}}>
      <SearchSheet onPick={onPick} {...props} />
    </Sheet>,
  );
  return onPick;
}

const type = (text: string) => fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: text } });

test("with few local hits the hits of Open Food Facts follow with the source note", async () => {
  const { calls } = fakeApi();
  const onPick = renderSearch({ onCreate: () => {} });
  type("Zippelmo");
  expect(await screen.findByText("Suche bei Open Food Facts …")).toBeInTheDocument();
  const off = await screen.findByRole("group", { name: "Open Food Facts" });
  expect(screen.queryByText("Suche bei Open Food Facts …")).not.toBeInTheDocument();
  expect(within(off).getByText("Daten von Open Food Facts (ODbL)")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Neu anlegen" })).not.toBeInTheDocument();
  fireEvent.click(within(off).getByRole("button", { name: /^Zippelmo Beerenmüsli/ }));
  expect(onPick).toHaveBeenCalledWith(muesliHit);
  expect(calls.filter((c) => c.url.startsWith("/api/v1/foods/search/off"))).toHaveLength(1);
});

test("enough local hits ask no Open Food Facts; a failure says so and offers Neu anlegen", async () => {
  const { calls } = fakeApi();
  renderSearch({ onCreate: () => {} });
  type("ba"); // under 3 characters
  expect(await screen.findByRole("button", { name: "Neu anlegen" })).toBeInTheDocument();
  type("offline");
  expect(await screen.findByText("Open Food Facts ist gerade nicht erreichbar.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Neu anlegen" })).toBeInTheDocument();
  expect(calls.filter((c) => c.url.startsWith("/api/v1/foods/search/off")).map((c) => c.url)).toEqual([
    "/api/v1/foods/search/off?q=offline",
  ]);
});

test("foodsOnly never asks Open Food Facts", async () => {
  const { calls } = fakeApi();
  renderSearch({ foodsOnly: true });
  type("Zippelmo");
  expect(await screen.findByText("Nicht gefunden.")).toBeInTheDocument();
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(calls.some((c) => c.url.startsWith("/api/v1/foods/search/off"))).toBe(false);
});

test("before anything is typed the guesses stand above the foods last used", async () => {
  fakeApi();
  const onPick = renderSearch({ foodsOnly: true });
  const likely = await screen.findByRole("group", { name: "Jetzt wahrscheinlich" });
  expect(within(likely).getAllByRole("button").map((b) => b.textContent)).toEqual([
    expect.stringMatching(/^Reis gekocht/),
  ]);
  const recent = screen.getByRole("group", { name: "Zuletzt" });
  expect(within(recent).getAllByRole("button")).toHaveLength(3);
  fireEvent.click(within(recent).getByRole("button", { name: /^Banane roh/ }));
  expect(onPick).toHaveBeenCalledWith({ ...banana, gtin: null });
  // Typing makes room for the hits.
  type("banane");
  expect(screen.queryByRole("group", { name: "Zuletzt" })).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /^Banane roh/ })).toBeInTheDocument();
  type("");
  expect(screen.getByRole("group", { name: "Zuletzt" })).toBeInTheDocument();
});

test("guesses that only repeat the foods last used stay away", async () => {
  fakeApi();
  const hit = { food: { ...banana, gtin: null }, combo: null };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ likely: [hit], recent: [hit] }))),
  );
  renderSearch();
  expect(await screen.findByRole("group", { name: "Zuletzt" })).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Jetzt wahrscheinlich" })).not.toBeInTheDocument();
});

test("a Schnellzugriff last used stands in the list and is handed on; a food search leaves it out", async () => {
  fakeApi({ combos: [coffeeCombo()] });
  const onCombo = vi.fn();
  const { unmount } = render(
    <Sheet onClose={() => {}}>
      <SearchSheet onPick={() => {}} onCombo={onCombo} />
    </Sheet>,
  );
  const recent = await screen.findByRole("group", { name: "Zuletzt" });
  const row = within(recent).getAllByRole("button")[0];
  expect(row).toHaveTextContent("Kaffee");
  expect(row).toHaveTextContent("Schnellzugriff · 205 g");
  fireEvent.click(row);
  expect(onCombo).toHaveBeenCalledWith(coffeeCombo());
  unmount();

  renderSearch({ foodsOnly: true });
  const foods = await screen.findByRole("group", { name: "Zuletzt" });
  expect(within(foods).queryByText("Kaffee")).not.toBeInTheDocument();
  expect(within(foods).getAllByRole("button")).toHaveLength(3);
});

test("an own recipe stands out with its mark, other foods keep their source", async () => {
  fakeApi();
  const own = { ...banana, id: 71, name: "Skyrbrötchen", source: "own" as const, gtin: null, recipe: true };
  const body = { likely: [], recent: [{ food: own, combo: null }, { food: { ...banana, gtin: null }, combo: null }] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body))),
  );
  renderSearch();
  const [first, second] = within(await screen.findByRole("group", { name: "Zuletzt" })).getAllByRole("button");
  expect(first).toHaveTextContent("Rezept");
  expect(within(first).getByText("Skyrbrötchen")).toHaveClass("text-primary");
  expect(second).not.toHaveTextContent("Rezept");
  expect(within(second).getByText("Banane roh")).not.toHaveClass("text-primary");
});

test("a hit says its origin in one word, shows its photo and stands under a capital label", async () => {
  fakeApi();
  renderSearch({ onCombo: () => {} });
  expect((await screen.findAllByText("Zuletzt"))[0]).toHaveClass("uppercase");
  type("banane");
  const row = await screen.findByRole("button", { name: /^Banane roh/ });
  expect(row).toHaveTextContent("BLS · je 100 g");
  expect(row).not.toHaveTextContent("generisch");
});

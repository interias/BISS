import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Sheet } from "@/components/sheet";
import { fakeApi, muesliHit } from "@/test/fixtures";
import { SearchSheet } from "./search-sheet";

afterEach(() => vi.unstubAllGlobals());

function renderSearch(props: { foodsOnly?: boolean; onCreate?: () => void } = {}) {
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

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Sheet } from "@/components/sheet";
import { banana, fakeApi, riceDetail, skyrRecipe } from "@/test/fixtures";
import { RecipeSheet } from "./recipe-sheet";

afterEach(() => vi.unstubAllGlobals());

function renderSheet(recipeId?: number) {
  const actions = { onSaved: vi.fn(), onCancel: vi.fn() };
  render(
    <Sheet onClose={() => {}}>
      <RecipeSheet recipeId={recipeId} recent={[banana, riceDetail]} {...actions} />
    </Sheet>,
  );
  return actions;
}

const preview = () => screen.getByTestId("preview");
const cooked = () => screen.getByRole("textbox", { name: "Fertiggewicht in g" });

test("a new recipe divides its ingredients into portions and saves them", async () => {
  const { calls } = fakeApi();
  const { onSaved } = renderSheet();
  expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();

  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: " Bananenbrot " } });
  fireEvent.click(screen.getByRole("button", { name: "+ Banane roh" }));
  // One banana of 120 g: 111.6 kcal in the whole dish.
  expect(preview()).toHaveTextContent("112kcal");
  expect(screen.getByText("1 Portion · 120 g")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "mehr Portionen" }));
  fireEvent.click(screen.getByRole("button", { name: "mehr Portionen" }));
  expect(screen.getByRole("status", { name: "Portionen" })).toHaveTextContent("3");
  expect(preview()).toHaveTextContent("37kcal");
  expect(screen.getByText("1 Portion · 40 g")).toBeInTheDocument();

  // Baked, it weighs less: the portion gets lighter, its values stay.
  fireEvent.change(cooked(), { target: { value: "90" } });
  expect(screen.getByText("1 Portion · 30 g")).toBeInTheDocument();
  expect(preview()).toHaveTextContent("37kcal");

  fireEvent.change(screen.getByRole("textbox", { name: "Zubereitung" }), { target: { value: "Backen." } });
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(calls.filter((c) => c.method === "POST").map((c) => [c.url, c.body])).toEqual([
    [
      "/api/v1/recipes",
      {
        name: "Bananenbrot",
        description: "Backen.",
        items: [{ food_id: 7, grams: 120 }],
        portions: 3,
        cooked_grams: 90,
      },
    ],
  ]);
});

test("an existing recipe opens with its values; an emptied weight goes back to the ingredients", async () => {
  const { calls } = fakeApi();
  const { onSaved } = renderSheet(skyrRecipe.id);

  expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Skyrbrötchen");
  expect(screen.getByRole("heading", { name: "Rezept bearbeiten" })).toBeInTheDocument();
  expect(cooked()).toHaveValue("450");
  expect(screen.getByRole("status", { name: "Portionen" })).toHaveTextContent("5");
  expect(within(screen.getByRole("list", { name: "Zutaten" })).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText("1 Portion · 90 g")).toBeInTheDocument();
  // The recipe's own food is no suggestion for its ingredients.
  expect(screen.queryByRole("button", { name: "+ Skyrbrötchen" })).not.toBeInTheDocument();

  fireEvent.change(cooked(), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "weniger Portionen" }));
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  const [patch] = calls.filter((c) => c.method === "PATCH");
  expect(patch.url).toBe(`/api/v1/recipes/${skyrRecipe.id}`);
  expect(patch.body).toMatchObject({ portions: 4, cooked_grams: null, name: "Skyrbrötchen" });
});

test("a failed save says so and keeps the sheet", async () => {
  fakeApi();
  const { onSaved } = renderSheet();
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "kaputt" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Banane roh" }));
  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Speichern fehlgeschlagen.");
  expect(onSaved).not.toHaveBeenCalled();
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Sheet } from "@/components/sheet";
import { banana, fakeApi, fakePlate, riceDetail, skyrRecipe } from "@/test/fixtures";
import { parseWeight, RecipeSheet } from "./recipe-sheet";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

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

/** fakeApi plus POST /recipes/import answering the plate fixture as a recipe. */
function withImport(status = 200) {
  const api = fakeApi();
  const inner = fetch;
  const sources: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== "/api/v1/recipes/import") return inner(url, init);
      sources.push(JSON.parse(init!.body as string).source);
      const plate = fakePlate(false);
      const body = {
        name: "Hähnchenpfanne",
        portions: 4,
        description: "1. Anbraten.",
        items: plate.items,
        notes: "Brokkoli geschätzt.",
        link: null,
        model: "fast",
        attempts: 1,
      };
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return { ...api, sources };
}

test("a recipe from a text fills the sheet; an unmatched ingredient stays visible until searched", async () => {
  const { calls, sources } = withImport();
  const { onSaved } = renderSheet();

  fireEvent.click(screen.getByRole("button", { name: "+ Aus Text oder Link" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Rezepttext oder Link" }), {
    target: { value: "  500 g Hähnchen, 300 g Reis, Brokkoli " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));

  expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Hähnchenpfanne");
  expect(sources).toEqual(["500 g Hähnchen, 300 g Reis, Brokkoli"]);
  expect(screen.queryByRole("textbox", { name: "Rezepttext oder Link" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Zubereitung" })).toHaveValue("1. Anbraten.");
  expect(screen.getByRole("status", { name: "Portionen" })).toHaveTextContent("4");
  expect(screen.getByText("nicht zugeordnet")).toBeInTheDocument();
  expect(screen.getByText("Nicht zugeordnete Zutaten zählen nicht mit.")).toBeInTheDocument();
  expect(screen.getByText("Brokkoli geschätzt.")).toBeInTheDocument();

  // Searching it keeps its grams and takes it off the open ones.
  fireEvent.click(screen.getByRole("button", { name: "Broccoli gekocht suchen" }));
  expect(screen.getByRole("textbox", { name: "Suchen" })).toHaveValue("Broccoli gekocht");
  fireEvent.change(screen.getByRole("textbox", { name: "Suchen" }), { target: { value: "brok" } });
  fireEvent.click(await screen.findByRole("button", { name: /Broccoli gekocht/ }));
  expect(screen.queryByText("nicht zugeordnet")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  const [post] = calls.filter((c) => c.method === "POST" && c.url === "/api/v1/recipes");
  expect(post.body).toMatchObject({
    name: "Hähnchenpfanne",
    portions: 4,
    items: [
      { food_id: 9, grams: 120 },
      { food_id: 8, grams: 150 },
      { food_id: 10, grams: 80 },
    ],
  });
});

test("a link that does not load says to paste the text", async () => {
  withImport(502);
  renderSheet();
  fireEvent.click(screen.getByRole("button", { name: "+ Aus Text oder Link" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Rezepttext oder Link" }), {
    target: { value: "https://www.chefkoch.de/rezepte/1/x.html" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Füge den Rezepttext ein.");
  expect(screen.getByRole("textbox", { name: "Rezepttext oder Link" })).toHaveValue(
    "https://www.chefkoch.de/rezepte/1/x.html",
  );
});

test("the finished weight is read as typed in German, a wrong one blocks saving", () => {
  expect([parseWeight("1.200"), parseWeight("450,5"), parseWeight("450.5"), parseWeight(" 300 ")]).toEqual([
    1200, 450.5, 450.5, 300,
  ]);
  expect(parseWeight("abc")).toBeNaN();

  fakeApi();
  renderSheet();
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Brot" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Banane roh" }));
  fireEvent.change(cooked(), { target: { value: "1.200" } });
  expect(screen.getByText("1 Portion · 1.200 g")).toBeInTheDocument();
  for (const wrong of ["60000", "-5", "abc"]) {
    fireEvent.change(cooked(), { target: { value: wrong } });
    expect(screen.getByRole("alert")).toHaveTextContent("Fertiggewicht in Gramm");
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  }
});

test("a sheet closed by accident opens again as it was, until saved, cancelled or discarded", async () => {
  fakeApi();
  const first = render(
    <Sheet onClose={() => {}}>
      <RecipeSheet recent={[banana, riceDetail]} onSaved={vi.fn()} onCancel={vi.fn()} />
    </Sheet>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bananenbrot" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Banane roh" }));
  fireEvent.click(screen.getByRole("button", { name: "mehr Portionen" }));
  first.unmount();

  const { onCancel } = renderSheet();
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Bananenbrot");
  expect(screen.getByRole("status", { name: "Portionen" })).toHaveTextContent("2");
  expect(within(screen.getByRole("list", { name: "Zutaten" })).getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByText(/Entwurf von vorhin/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("");
  expect(window.localStorage.length).toBe(0);

  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Neu" } });
  expect(window.localStorage.length).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(window.localStorage.length).toBe(0);
});

test("Escape in the ingredient search goes back to the recipe", () => {
  fakeApi();
  renderSheet();
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Brot" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Zutat suchen" }));
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Suchen" }), { key: "Escape" });
  expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Brot");
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

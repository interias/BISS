import { expect, test } from "@playwright/test";

// The ring shows the goal of the day set over the api (ADR-0007: the fitness app sets it).

let day: string;

test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/v1/days/today");
  expect(response.ok()).toBe(true);
  day = (await response.json()).date;
});

test.afterEach(async ({ request }) => {
  // Back to the default, so that no other test depends on this goal.
  expect((await request.delete(`/api/v1/goals/${day}`)).status()).toBe(204);
});

test("a goal set over the api for the day shows in the ring", async ({ page, request }) => {
  const goal = { kcal: 1987, protein: 140, carbs: 210, fat: 66 };
  const response = await request.put(`/api/v1/goals/${day}`, { data: goal });
  expect(response.ok()).toBe(true);
  expect((await response.json()).kind).toBe("day");

  await page.goto("/");
  const summary = page.getByRole("region", { name: "Tagesbilanz" });
  await expect(summary.getByText("von 1.987 kcal")).toBeVisible();
  await expect(summary.getByTestId("macro-protein")).toContainText("/ 140 g");
  await expect(summary.getByTestId("macro-carbs")).toContainText("/ 210 g");
  await expect(summary.getByTestId("macro-fat")).toContainText("/ 66 g");
});

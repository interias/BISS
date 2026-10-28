import { expect, type APIRequestContext, type Page } from "@playwright/test";

type Entry = { id: number; grams: number; macros: { kcal: number } };

/** Id of the first search hit whose name starts with the given text. */
export async function findFood(request: APIRequestContext, query: string, name: string) {
  const response = await request.get(`/api/v1/foods/search?q=${encodeURIComponent(query)}`);
  expect(response.ok()).toBe(true);
  const hits: { id: number; name: string }[] = await response.json();
  const hit = hits.find((food) => food.name.startsWith(name));
  expect(hit, `search "${query}" finds ${name}`).toBeDefined();
  return hit!.id;
}

/** Tracks the entries a test creates and removes them afterwards (the db volume stays). */
export class Entries {
  private ids = new Set<number>();
  private groups = new Set<string>();
  constructor(private request: APIRequestContext) {}

  track(id: number) {
    this.ids.add(id);
    return id;
  }

  async create(foodId: number, grams: number, meal: string): Promise<Entry> {
    const response = await this.request.post("/api/v1/entries", {
      data: { food_id: foodId, grams, meal },
    });
    expect(response.status()).toBe(201);
    const entry: Entry = await response.json();
    this.track(entry.id);
    return entry;
  }

  /** A Gericht logged by a test; cleanup removes the group with all its entries. */
  trackGroup(id: string) {
    this.groups.add(id);
    return id;
  }

  async cleanup() {
    // 404 is fine: the test may have removed the entry itself.
    for (const id of this.ids) await this.request.delete(`/api/v1/entries/${id}`);
    for (const id of this.groups) await this.request.delete(`/api/v1/entries/group/${id}`);
    this.ids.clear();
    this.groups.clear();
  }
}

/** The kcal total in the ring as a number ("1.234" → 1234). */
export async function totalKcal(page: Page) {
  const text = await page.getByTestId("kcal-total").textContent();
  return Number((text ?? "").replace(/\./g, ""));
}

/** The id from the response of the next request matching method and path. */
export async function entryIdFrom(page: Page, method: string, path: RegExp, action: () => Promise<void>) {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname)),
    action(),
  ]);
  expect(response.ok()).toBe(true);
  return (await response.json()) as Entry;
}

/**
 * Counts the taps for the tap budgets of SPEC 1: every trusted click in the page, seen in
 * the capture phase at the document. Call before `page.goto`; the count starts there.
 * `setInputFiles` clicks nothing, so a file choice in place of the camera is not counted.
 */
export async function countTaps(page: Page) {
  await page.addInitScript(() => {
    const counter = window as Window & { bissTaps?: number };
    counter.bissTaps = 0;
    document.addEventListener(
      "click",
      (event) => {
        if (event.isTrusted) counter.bissTaps = (counter.bissTaps ?? 0) + 1;
      },
      { capture: true },
    );
  });
  return () => page.evaluate(() => (window as Window & { bissTaps?: number }).bissTaps ?? 0);
}

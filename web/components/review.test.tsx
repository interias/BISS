import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { bananaEntry, fakeApi } from "@/test/fixtures";
import { Home } from "./home";

// Review of earlier days, statistics and settings (ADR-0015). The fake's today is Wed 28 Oct.

vi.mock("@/components/camera/scanner", () => ({
  cameraAvailable: () => false,
  scanLive: async () => () => {},
  decodeImage: async () => "",
  captureFrame: async () => new Blob(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const yesterdayEntry = { ...bananaEntry, id: 31, grams: 150, eaten_at: "2026-10-27T18:00:00+01:00", day: "2026-10-27" };

test("the arrow shows yesterday without a dock; Zurück zu heute returns", async () => {
  fakeApi({ entries: [yesterdayEntry] });
  render(<Home />);
  await screen.findByText("Heute · Mi 28. Okt");
  expect(screen.queryByRole("button", { name: "Einen Tag vor" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Einen Tag zurück" }));
  expect(await screen.findByText("Gestern · Di 27. Okt")).toBeInTheDocument();
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  expect(await within(diary).findByText("Banane roh")).toBeInTheDocument();
  // An earlier day has no dock, only the bar.
  expect(screen.queryByRole("button", { name: "Lebensmittel suchen" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ Nachtragen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Einen Tag vor" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Zurück zu heute" }));
  expect(await screen.findByText("Heute · Mi 28. Okt")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lebensmittel suchen" })).toBeInTheDocument();
});

test("Tag wählen opens a day of the month; days after today are locked", async () => {
  fakeApi({ entries: [yesterdayEntry] });
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Heute · Mi 28. Okt, Tag wählen" }));
  const sheet = await screen.findByRole("dialog", { name: "Tag wählen" });
  expect(within(sheet).getByRole("heading", { name: "Oktober 2026" })).toBeInTheDocument();
  expect(within(sheet).getByRole("button", { name: "Monat vor" })).toBeDisabled();
  expect(within(sheet).getByRole("button", { name: /^Do 29\. Okt/ })).toBeDisabled();
  expect(await within(sheet).findByRole("button", { name: "Gestern · Di 27. Okt, 112 kcal" })).toBeEnabled();
  expect(within(sheet).getByRole("button", { name: /^Heute · Mi 28\. Okt/ })).toHaveAttribute("aria-current", "date");

  fireEvent.click(within(sheet).getByRole("button", { name: "Di 20. Okt, keine Einträge" }));
  expect(await screen.findByText("Di 20. Okt")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Für diesen Tag gibt es keine Einträge.")).toBeInTheDocument();
});

test("+ Nachtragen logs on that day, says so and Rückgängig removes it", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T12:30:00Z"));
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Einen Tag zurück" }));
  fireEvent.click(await screen.findByRole("button", { name: "+ Nachtragen" }));
  expect(screen.getByText("Trägt ein für Di 27. Okt")).toBeInTheDocument();

  fireEvent.click(await screen.findByRole("button", { name: /Banane roh\s*120 g/ }));
  await screen.findByText("Banane roh eingetragen für Di 27. Okt · 112 kcal");
  // 13:30 in Berlin, on the day before.
  expect(calls.find((c) => c.method === "POST")).toEqual({
    method: "POST",
    url: "/api/v1/entries",
    body: { food_id: 7, eaten_at: "2026-10-27T12:30:00.000Z" },
  });
  const diary = screen.getByRole("region", { name: "Tagebuch" });
  expect(await within(diary).findByText("Banane roh")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
  await waitFor(() => expect(within(diary).queryByText("Banane roh")).not.toBeInTheDocument());

  // Fertig hides the dock again.
  fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
  expect(screen.queryByRole("button", { name: "Lebensmittel suchen" })).not.toBeInTheDocument();
});

test("the camera always logs for today, from an earlier day and from every tab", async () => {
  fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Einen Tag zurück" }));
  await screen.findByText("Gestern · Di 27. Okt");
  fireEvent.click(screen.getByRole("button", { name: /^Kamera/ }));
  expect(await screen.findByRole("region", { name: "Kamera" })).toBeInTheDocument();
  expect(await screen.findByText("Heute · Mi 28. Okt")).toBeInTheDocument();
});

test("the bar of the tabs: Heute on Heute jumps to today, the active tab is marked", async () => {
  fakeApi();
  render(<Home />);
  const nav = await screen.findByRole("navigation", { name: "Bereiche" });
  expect(within(nav).getByRole("button", { name: "Heute" })).toHaveAttribute("aria-current", "page");
  fireEvent.click(await screen.findByRole("button", { name: "Einen Tag zurück" }));
  await screen.findByText("Gestern · Di 27. Okt");
  fireEvent.click(within(nav).getByRole("button", { name: "Heute" }));
  expect(await screen.findByText("Heute · Mi 28. Okt")).toBeInTheDocument();

  fireEvent.click(within(nav).getByRole("button", { name: "Einstellungen" }));
  expect(screen.getByRole("heading", { name: "Einstellungen" })).toBeInTheDocument();
  expect(within(nav).getByRole("button", { name: "Einstellungen" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("button", { name: "Lebensmittel suchen" })).not.toBeInTheDocument();
});

test("Statistik answers with the average first; a bar opens its day", async () => {
  const { calls } = fakeApi({ entries: [{ ...yesterdayEntry, day: "2026-10-21", eaten_at: "2026-10-21T18:00:00+02:00" }] });
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Statistik" }));
  // This week on opening, one step back is last week: 19 to 25 October.
  expect(await screen.findByText("Diese Woche")).toBeInTheDocument();
  expect(calls.some((c) => c.url === "/api/v1/stats?from=2026-10-26&to=2026-11-01")).toBe(true);
  fireEvent.click(await screen.findByRole("button", { name: "Zeitraum zurück" }));
  expect(await screen.findByText("Letzte Woche")).toBeInTheDocument();
  expect(screen.getByText("19. – 25. Okt")).toBeInTheDocument();
  const hero = await screen.findByRole("region", { name: "Schnitt je Tag" });
  expect(hero).toHaveTextContent("2.276kcal je Tag");
  expect(hero).toHaveTextContent("124 unter deinem Ziel von 2.400. 67 kcal weniger als in der Woche davor.");
  expect(hero).toHaveTextContent("Aus 6 von 7 Tagen. An 2 Tagen im Zielbereich (±10 %).");
  expect(screen.getByTestId("average-protein")).toHaveTextContent("An 5 von 6 Tagen im Zielbereich");
  expect(calls.some((c) => c.url === "/api/v1/stats?from=2026-10-19&to=2026-10-25")).toBe(true);
  // No weekdays in a week; the most frequent food.
  expect(screen.queryByRole("region", { name: "Nach Wochentag" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Am häufigsten" })).toHaveTextContent("Banane roh5×560 kcal");

  fireEvent.click(await screen.findByRole("button", { name: "Mi 21. Okt: 112 kcal" }));
  fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
  expect(await screen.findByText("Mi 21. Okt")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "BISS" })).toBeInTheDocument();
});

test("Statistik switches to the month with weekdays; there is nothing after today", async () => {
  fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Statistik" }));
  expect(await screen.findByRole("button", { name: "Zeitraum vor" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Monat" }));
  expect(await screen.findByText("Dieser Monat")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zeitraum vor" })).toBeDisabled();
  fireEvent.click(await screen.findByRole("button", { name: "Zeitraum zurück" }));
  expect(await screen.findByText("Letzter Monat")).toBeInTheDocument();
  expect(screen.getByText("September 2026")).toBeInTheDocument();
  expect(await screen.findByRole("region", { name: "Nach Wochentag" })).toHaveTextContent("Mi–");
  fireEvent.click(screen.getByRole("button", { name: "Zeitraum vor" }));
  expect(await screen.findByText("Dieser Monat")).toBeInTheDocument();
});

test("Einstellungen: carbs are the remainder, Ab heute übernehmen saves with Rückgängig", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
  const protein = await screen.findByLabelText("Eiweiß");
  expect(protein).toHaveValue("160");
  expect(screen.getByTestId("goal-carbs")).toHaveTextContent("271 g");
  expect(screen.getByTestId("goal-shares")).toHaveTextContent("E 27 % · K 45 % · F 28 %");
  expect(screen.getByText("Gilt seit Do 1. Okt.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ab heute übernehmen" })).not.toBeInTheDocument();

  fireEvent.change(protein, { target: { value: "180" } });
  expect(screen.getByTestId("goal-carbs")).toHaveTextContent("251 g");
  expect(screen.getByText("Gilt ab heute, Mi 28. Okt. Frühere Tage behalten ihre Ziele.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ab heute übernehmen" }));
  await screen.findByText("Neue Ziele gelten ab heute");
  expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ kcal: 2400, protein: 180, fat: 75 });
  expect(await screen.findByText("seit heute")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Rückgängig" }));
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2));
  expect(calls.filter((c) => c.method === "PUT")[1].body).toEqual({ kcal: 2400, protein: 160, fat: 75 });
});

test("Einstellungen: protein and fat above the kcal warn and cannot be saved; Verwerfen resets", async () => {
  fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
  fireEvent.change(await screen.findByLabelText("Kalorien"), { target: { value: "1000" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Eiweiß und Fett ergeben schon 1.315 kcal.");
  expect(screen.getByRole("button", { name: "Ab heute übernehmen" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
  expect(screen.getByLabelText("Kalorien")).toHaveValue("2400");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("Einstellungen: a tolerance applies at once", async () => {
  const { calls } = fakeApi();
  render(<Home />);
  fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
  const tolerance = await screen.findByRole("group", { name: "Toleranz" });
  expect(within(tolerance).getByRole("button", { name: "±10 %" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(within(tolerance).getByRole("button", { name: "±15 %" }));
  await screen.findByText("Toleranz ±15 % gespeichert");
  expect(calls.find((c) => c.method === "PUT" && c.url === "/api/v1/settings")?.body).toEqual({ tolerance: 0.15 });
  expect(within(tolerance).getByRole("button", { name: "±15 %" })).toHaveAttribute("aria-pressed", "true");
});

import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { bananaDetail, bananaEntry } from "@/test/fixtures";
import { AmountForm } from "./amount-sheet";

// SheetTitle needs a dialog around it.
const inDialog = (node: ReactNode) =>
  render(
    <Dialog.Root open>
      <Dialog.Content aria-describedby={undefined}>{node}</Dialog.Content>
    </Dialog.Root>,
  );

const amount = () => screen.getByRole("status", { name: "Menge" });
const preview = () => screen.getByTestId("preview");

test("starts with the standard serving and the suggested meal", () => {
  inDialog(<AmountForm food={bananaDetail} initialMeal="snack" onSubmit={() => {}} />);
  expect(screen.getByRole("heading", { name: "Banane roh" })).toBeInTheDocument();
  expect(screen.getByText("BLS")).toBeInTheDocument();
  expect(screen.getByText("generisch · BLS")).toBeInTheDocument();
  expect(amount()).toHaveTextContent("120g");
  expect(screen.getByRole("button", { name: "Mahlzeit: Snack" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 Banane/ })).toHaveAttribute("aria-pressed", "true");
  expect(preview()).toHaveTextContent("112kcal1Eiweiß24KH0Fett");
  expect(screen.getByRole("button", { name: "Eintragen · 112 kcal" })).toBeInTheDocument();
});

test("± changes the grams and the preview follows live", () => {
  inDialog(<AmountForm food={bananaDetail} initialMeal="snack" onSubmit={() => {}} />);
  const minus = screen.getByRole("button", { name: "weniger" });
  fireEvent.click(minus); // 110
  fireEvent.click(minus); // 100
  fireEvent.click(minus); // 95
  fireEvent.click(minus); // 90
  expect(amount()).toHaveTextContent("90g");
  expect(preview()).toHaveTextContent("84kcal");
  expect(screen.getByRole("button", { name: /1 Banane/ })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "mehr" }));
  expect(amount()).toHaveTextContent("95g");
  fireEvent.click(screen.getByRole("button", { name: /1 Banane/ }));
  expect(amount()).toHaveTextContent("120g");
});

test("a tap on the meal chip cycles the meal and Eintragen sends grams and meal", () => {
  const onSubmit = vi.fn();
  inDialog(<AmountForm food={bananaDetail} initialMeal="snack" onSubmit={onSubmit} />);
  const chip = screen.getByRole("button", { name: /Mahlzeit/ });
  fireEvent.click(chip);
  expect(chip).toHaveTextContent("Abend");
  fireEvent.click(chip);
  expect(chip).toHaveTextContent("Frühstück");
  fireEvent.click(screen.getByRole("button", { name: /Eintragen/ }));
  expect(onSubmit).toHaveBeenCalledWith(120, "breakfast");
});

test("ml foods convert the grams through the density for the preview", () => {
  const milk = {
    ...bananaDetail,
    basis: "ml" as const,
    density: 1.03,
    per_100: { ...bananaDetail.per_100, kcal: 64 },
    standard_serving: { label: "1 Glas", grams: 206, origin: "estimated" as const },
  };
  inDialog(<AmountForm food={milk} initialMeal="breakfast" onSubmit={() => {}} />);
  expect(preview()).toHaveTextContent("128kcal");
});

test("an entry opens in edit mode with Speichern and Entfernen", () => {
  const onRemove = vi.fn();
  const onSubmit = vi.fn();
  inDialog(
    <AmountForm
      food={bananaDetail}
      entry={{ ...bananaEntry, grams: 90, meal: "lunch" }}
      initialMeal="snack"
      onSubmit={onSubmit}
      onRemove={onRemove}
    />,
  );
  expect(amount()).toHaveTextContent("90g");
  expect(screen.getByRole("button", { name: "Mahlzeit: Mittag" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Speichern · 84 kcal" }));
  expect(onSubmit).toHaveBeenCalledWith(90, "lunch");
  fireEvent.click(screen.getByRole("button", { name: "Entfernen" }));
  expect(onRemove).toHaveBeenCalledOnce();
});

test("Bearbeiten hands over the current grams and meal", () => {
  const onEdit = vi.fn();
  inDialog(<AmountForm food={bananaDetail} initialMeal="snack" onSubmit={() => {}} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("button", { name: "mehr" }));
  fireEvent.click(screen.getByRole("button", { name: /Mahlzeit/ }));
  fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
  expect(onEdit).toHaveBeenCalledWith(130, "dinner");
});

test("without onEdit there is no Bearbeiten, and initial grams and meal win over the entry", () => {
  inDialog(
    <AmountForm
      food={bananaDetail}
      entry={bananaEntry}
      initial={{ grams: 75, meal: "lunch" }}
      initialMeal="snack"
      onSubmit={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: "Bearbeiten" })).not.toBeInTheDocument();
  expect(amount()).toHaveTextContent("75g");
  expect(screen.getByRole("button", { name: "Mahlzeit: Mittag" })).toBeInTheDocument();
});

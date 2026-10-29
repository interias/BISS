import { fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { bananaDetail, bananaEntry, puddingDraft } from "@/test/fixtures";
import { AmountForm } from "./amount-sheet";

// SheetTitle needs a dialog around it.
const inDialog = (node: ReactNode) =>
  render(
    <Dialog.Root open>
      <Dialog.Content aria-describedby={undefined}>{node}</Dialog.Content>
    </Dialog.Root>,
  );

const amount = () => screen.getByRole("spinbutton", { name: "Menge" });
const preview = () => screen.getByTestId("preview");

test("starts with the standard serving and shows no meal", () => {
  inDialog(<AmountForm food={bananaDetail} onSubmit={() => {}} />);
  expect(screen.getByRole("heading", { name: "Banane roh" })).toBeInTheDocument();
  expect(screen.getByText("BLS")).toBeInTheDocument();
  expect(screen.getByText("generisch · BLS")).toBeInTheDocument();
  expect(amount()).toHaveValue(120);
  expect(screen.queryByRole("button", { name: /Mahlzeit/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 Banane/ })).toHaveAttribute("aria-pressed", "true");
  expect(preview()).toHaveTextContent("112kcal1Eiweiß24KH0Fett");
  expect(screen.getByRole("button", { name: "Eintragen · 112 kcal" })).toBeInTheDocument();
});

test("± changes the grams and the preview follows live", () => {
  inDialog(<AmountForm food={bananaDetail} onSubmit={() => {}} />);
  const minus = screen.getByRole("button", { name: "weniger" });
  fireEvent.click(minus); // 110
  fireEvent.click(minus); // 100
  fireEvent.click(minus); // 95
  fireEvent.click(minus); // 90
  expect(amount()).toHaveValue(90);
  expect(preview()).toHaveTextContent("84kcal");
  expect(screen.getByRole("button", { name: /1 Banane/ })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "mehr" }));
  expect(amount()).toHaveValue(95);
  fireEvent.click(screen.getByRole("button", { name: /1 Banane/ }));
  expect(amount()).toHaveValue(120);
});

test("the grams can be typed, at least 1 g, and Eintragen sends them", () => {
  const onSubmit = vi.fn();
  inDialog(<AmountForm food={bananaDetail} onSubmit={onSubmit} />);
  fireEvent.change(amount(), { target: { value: "37" } });
  expect(preview()).toHaveTextContent("34kcal");
  fireEvent.click(screen.getByRole("button", { name: /Eintragen/ }));
  expect(onSubmit).toHaveBeenCalledWith(37);
  fireEvent.change(amount(), { target: { value: "0" } });
  fireEvent.blur(amount());
  expect(amount()).toHaveValue(1);
  fireEvent.click(screen.getByRole("button", { name: "weniger" }));
  expect(amount()).toHaveValue(1);
  fireEvent.click(screen.getByRole("button", { name: "mehr" }));
  expect(amount()).toHaveValue(2);
});

test("a typed amount above 1500 g stays for a single entry", () => {
  inDialog(<AmountForm food={bananaDetail} onSubmit={() => {}} />);
  fireEvent.change(amount(), { target: { value: "2000" } });
  fireEvent.blur(amount());
  expect(amount()).toHaveValue(2000);
});

test("ml foods convert the grams through the density for the preview", () => {
  const milk = {
    ...bananaDetail,
    basis: "ml" as const,
    density: 1.03,
    per_100: { ...bananaDetail.per_100, kcal: 64 },
    standard_serving: { label: "1 Glas", grams: 206, origin: "estimated" as const },
  };
  inDialog(<AmountForm food={milk} onSubmit={() => {}} />);
  expect(preview()).toHaveTextContent("128kcal");
});

test("an entry opens in edit mode with Speichern and Entfernen", () => {
  const onRemove = vi.fn();
  const onSubmit = vi.fn();
  inDialog(
    <AmountForm
      food={bananaDetail}
      entry={{ ...bananaEntry, grams: 90, meal: "lunch" }}
     
      onSubmit={onSubmit}
      onRemove={onRemove}
    />,
  );
  expect(amount()).toHaveValue(90);
  fireEvent.click(screen.getByRole("button", { name: "Speichern · 84 kcal" }));
  expect(onSubmit).toHaveBeenCalledWith(90);
  fireEvent.click(screen.getByRole("button", { name: "Entfernen" }));
  expect(onRemove).toHaveBeenCalledOnce();
});

test("Bearbeiten hands over the current grams", () => {
  const onEdit = vi.fn();
  inDialog(<AmountForm food={bananaDetail} onSubmit={() => {}} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("button", { name: "mehr" }));
  fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
  expect(onEdit).toHaveBeenCalledWith(130);
});

test("without onEdit there is no Bearbeiten, and initial grams win over the entry", () => {
  inDialog(
    <AmountForm
      food={bananaDetail}
      entry={bananaEntry}
      initial={{ grams: 75 }}
     
      onSubmit={() => {}}
    />,
  );
  expect(screen.queryByRole("button", { name: "Bearbeiten" })).not.toBeInTheDocument();
  expect(amount()).toHaveValue(75);
});

test("data from Open Food Facts carry the source note (ADR-0002), other foods do not", () => {
  const { unmount } = inDialog(<AmountForm food={puddingDraft} onSubmit={() => {}} />);
  expect(screen.getByText("Open Food Facts")).toBeInTheDocument();
  expect(screen.getByText("Daten von Open Food Facts (ODbL)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 Becher/ })).toHaveAttribute("aria-pressed", "true");
  unmount();
  inDialog(<AmountForm food={bananaDetail} onSubmit={() => {}} />);
  expect(screen.queryByText(/ODbL/)).not.toBeInTheDocument();
});

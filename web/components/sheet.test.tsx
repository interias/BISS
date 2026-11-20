import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, test } from "vitest";
import { Sheet, SheetTitle } from "./sheet";

function Harness() {
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState(true);
  const close = () => setOpen(false);
  return (
    <>
      <button data-sheet-home>Lebensmittel suchen</button>
      {row && <button onClick={() => setOpen(true)}>Banane roh</button>}
      {open && (
        <Sheet onClose={close}>
          <SheetTitle>Banane roh</SheetTitle>
          <button
            onClick={() => {
              setRow(false);
              close();
            }}
          >
            Entfernen
          </button>
        </Sheet>
      )}
    </>
  );
}

const open = () => {
  const row = screen.getByRole("button", { name: "Banane roh" });
  row.focus();
  fireEvent.click(row);
  return row;
};

test("a closed sheet hands the focus back to what opened it", async () => {
  render(<Harness />);
  const row = open();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(row).toHaveFocus());
});

test("when the opener is gone, the focus goes to the search", async () => {
  render(<Harness />);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Entfernen" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Lebensmittel suchen" })).toHaveFocus());
});

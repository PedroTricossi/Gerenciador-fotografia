import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>abrir</button>
      <ConfirmDialog
        open={open}
        title="Anonimizar cliente"
        confirmLabel="Anonimizar"
        tone="danger"
        requireText="ANONIMIZAR"
        onConfirm={onConfirm}
        onCancel={() => setOpen(false)}
      >
        <p>Esta ação não pode ser desfeita.</p>
      </ConfirmDialog>
    </>
  );
}

test("confirming requires the exact typed word", async () => {
  const user = userEvent.setup();
  const onConfirm = vi.fn();
  render(<Harness onConfirm={onConfirm} />);
  await user.click(screen.getByRole("button", { name: "abrir" }));

  const dialog = screen.getByRole("dialog", { name: "Anonimizar cliente" });
  expect(dialog).toHaveTextContent("Esta ação não pode ser desfeita.");
  const confirm = screen.getByRole("button", { name: "Anonimizar" });
  expect(confirm).toBeDisabled();

  await user.type(screen.getByLabelText("Digite ANONIMIZAR para confirmar"), "anonimizar");
  expect(confirm).toBeDisabled();
  await user.clear(screen.getByLabelText("Digite ANONIMIZAR para confirmar"));
  await user.type(screen.getByLabelText("Digite ANONIMIZAR para confirmar"), "ANONIMIZAR");
  await user.click(confirm);
  expect(onConfirm).toHaveBeenCalledOnce();
});

test("cancelling closes it and the typed word does not survive a reopen", async () => {
  const user = userEvent.setup();
  render(<Harness onConfirm={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "abrir" }));
  await user.type(screen.getByLabelText("Digite ANONIMIZAR para confirmar"), "ANONIMIZAR");
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "abrir" }));
  expect(screen.getByLabelText("Digite ANONIMIZAR para confirmar")).toHaveValue("");
});

test("shows an error and a busy confirm button", () => {
  render(
    <ConfirmDialog
      open
      title="Excluir"
      confirmLabel="Excluir"
      busy
      error="Falhou"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    >
      <p>Excluir este contrato?</p>
    </ConfirmDialog>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Falhou");
  expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
});

function cancelEvent(dialog: HTMLElement) {
  const event = new Event("cancel", { cancelable: true });
  fireEvent(dialog, event);
  return event;
}

test("Escape while busy keeps the dialog open", () => {
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Excluir"
      confirmLabel="Excluir"
      busy
      onConfirm={vi.fn()}
      onCancel={onCancel}
    >
      <p>Excluir este contrato?</p>
    </ConfirmDialog>,
  );
  const event = cancelEvent(screen.getByRole("dialog", { name: "Excluir" }));
  expect(event.defaultPrevented).toBe(true);
  expect(onCancel).not.toHaveBeenCalled();
});

test("Escape when not busy cancels", () => {
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Excluir"
      confirmLabel="Excluir"
      onConfirm={vi.fn()}
      onCancel={onCancel}
    >
      <p>Excluir este contrato?</p>
    </ConfirmDialog>,
  );
  cancelEvent(screen.getByRole("dialog", { name: "Excluir" }));
  expect(onCancel).toHaveBeenCalledOnce();
});

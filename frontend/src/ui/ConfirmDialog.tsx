import { type ReactNode, useState } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Dialog, DialogActions } from "./Dialog";
import { Field } from "./Field";
import { TextInput } from "./TextInput";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: "default" | "danger";
  requireText?: string;
  busy?: boolean;
  error?: string | null;
};

export function ConfirmDialog({ open, title, onCancel, ...body }: Props) {
  return (
    <Dialog open={open} title={title} onClose={onCancel} dismissable={!body.busy}>
      {/* Mounted only while open, so the typed text starts empty every time. */}
      <ConfirmBody onCancel={onCancel} {...body} />
    </Dialog>
  );
}

function ConfirmBody({
  children,
  confirmLabel,
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  tone = "default",
  requireText,
  busy = false,
  error = null,
}: Omit<Props, "open" | "title">) {
  const [typed, setTyped] = useState("");
  const ready = requireText === undefined || typed === requireText;
  return (
    <>
      {children}
      {requireText !== undefined && (
        <Field label={`Digite ${requireText} para confirmar`}>
          {(control) => (
            <TextInput
              {...control}
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          )}
        </Field>
      )}
      {error && <Banner tone="error">{error}</Banner>}
      <DialogActions>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={!ready}
          busy={busy}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </>
  );
}

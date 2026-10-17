import { type ReactNode, useEffect, useId, useRef } from "react";
import styles from "./Dialog.module.css";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  /** When false, Escape is ignored (for example while a request is running). */
  dismissable?: boolean;
  children: ReactNode;
};

export function Dialog({ open, title, onClose, dismissable = true, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: let the owner decide, so React state stays the source of truth.
        event.preventDefault();
        if (dismissable) onClose();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </>
      )}
    </dialog>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

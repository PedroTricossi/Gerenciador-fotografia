import { type ReactNode, useId } from "react";
import styles from "./Field.module.css";

export type ControlProps = { id: string; "aria-invalid": boolean; "aria-describedby"?: string };

type Props = {
  label: string;
  error?: string;
  hint?: string;
  children: (control: ControlProps) => ReactNode;
};

export function Field({ label, error, hint, children }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy || undefined,
      })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

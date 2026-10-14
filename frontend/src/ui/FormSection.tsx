import type { ReactNode } from "react";
import styles from "./FormSection.module.css";

type Props = { title: string; disabled?: boolean; children: ReactNode };

export function FormSection({ title, disabled = false, children }: Props) {
  return (
    <fieldset className={styles.section} disabled={disabled}>
      <legend className={styles.legend}>{title}</legend>
      <div className={styles.body}>{children}</div>
    </fieldset>
  );
}

import type { ReactNode } from "react";
import styles from "./AppFrame.module.css";

type Props = { nav: ReactNode; children: ReactNode };

// Pages render their own <main>, so the content column is a plain div.
export function AppFrame({ nav, children }: Props) {
  return (
    <div className={styles.frame}>
      {nav}
      <div className={styles.content}>{children}</div>
    </div>
  );
}

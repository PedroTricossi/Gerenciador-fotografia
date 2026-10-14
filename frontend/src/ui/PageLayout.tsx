import type { ReactNode } from "react";
import styles from "./PageLayout.module.css";

type Props = { title: string; actions?: ReactNode; children?: ReactNode };

export function PageLayout({ title, actions, children }: Props) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      {children}
    </main>
  );
}

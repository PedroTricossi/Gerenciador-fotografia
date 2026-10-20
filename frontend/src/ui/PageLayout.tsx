import type { ReactNode } from "react";
import styles from "./PageLayout.module.css";
import { useTyping } from "./useTyping";

type Props = { title: string; actions?: ReactNode; children?: ReactNode };

export function PageLayout({ title, actions, children }: Props) {
  const typed = useTyping(title);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={`${styles.title} ${typed === null ? "" : styles.typing}`}>
          {/* The whole title stays in the text; data-typed only drives what is drawn. */}
          <span data-typed={typed ?? undefined}>{title}</span>
        </h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      {children}
    </main>
  );
}

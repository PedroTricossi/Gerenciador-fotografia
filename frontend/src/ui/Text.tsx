import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import styles from "./Text.module.css";

export function Loading({ children = "Carregando…" }: { children?: ReactNode }) {
  return (
    <p role="status" className={styles.loading}>
      {children}
    </p>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyText}>{children}</p>
      {action}
    </div>
  );
}

export function TextLink(props: LinkProps) {
  return <Link {...props} className={styles.link} />;
}

export function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.hint}>
      {children}
    </p>
  );
}

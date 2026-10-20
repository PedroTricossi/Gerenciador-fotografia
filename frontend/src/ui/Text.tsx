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

export function Hint({
  id,
  live,
  children,
}: {
  id: string;
  /** Announce changes to screen readers as they happen. */
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <p id={id} className={styles.hint} aria-live={live ? "polite" : undefined}>
      {children}
    </p>
  );
}

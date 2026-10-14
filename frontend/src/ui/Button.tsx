import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
};

export function Button({
  variant = "secondary",
  busy = false,
  type = "button",
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      type={type}
      className={`${styles.button} ${styles[variant] ?? ""}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    />
  );
}

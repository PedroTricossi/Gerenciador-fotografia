import type { ReactNode } from "react";
import styles from "./Banner.module.css";

export function Banner({ tone, children }: { tone: "info" | "error"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`${styles.banner} ${styles[tone] ?? ""}`}
    >
      {children}
    </div>
  );
}

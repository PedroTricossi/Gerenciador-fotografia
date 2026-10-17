import { useState } from "react";
import styles from "./ThemeSwitch.module.css";
import { applyThemeChoice, readThemeChoice, writeThemeChoice, type ThemeChoice } from "./theme";

const NEXT: Record<ThemeChoice, ThemeChoice> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<ThemeChoice, string> = { auto: "Automático", light: "Claro", dark: "Escuro" };
const ACTION: Record<ThemeChoice, string> = {
  auto: "Automático (segue o Mac)",
  light: "Claro",
  dark: "Escuro",
};

export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);
  const next = NEXT[choice];

  function cycle() {
    writeThemeChoice(next);
    applyThemeChoice(next);
    setChoice(next);
  }

  return (
    <button
      type="button"
      className={styles.switch}
      onClick={cycle}
      aria-label={`Tema: ${LABEL[choice]}. Mudar para ${ACTION[next]}`}
    >
      Tema: {LABEL[choice]}
    </button>
  );
}

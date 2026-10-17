// Shares the key and values with public/theme-init.js, which applies the stored
// choice before first paint. "auto" means the key is absent.
export type ThemeChoice = "auto" | "light" | "dark";

const STORAGE_KEY = "gf-theme";

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function writeThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "auto") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Blocked storage: the choice lasts for this session only.
  }
}

export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

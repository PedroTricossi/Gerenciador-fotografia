// Runs synchronously in <head> so the stored theme applies before first paint.
// Plain ES2019, no imports. With nothing usable stored it sets nothing, and the
// stylesheet follows prefers-color-scheme.
try {
  var stored = window.localStorage.getItem("gf-theme");
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
} catch {
  // Blocked storage: stay automatic.
}

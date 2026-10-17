import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { contrastRatio } from "./contrast";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

/** Returns the body of the first `{ … }` block that follows `header` (no nested braces). */
function block(header: string): string {
  const start = css.indexOf(header);
  if (start === -1) throw new Error(`block not found: ${header}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function parse(body: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map[m[1] ?? ""] = (m[2] ?? "").trim();
  }
  return map;
}

const light = parse(block(":root {"));
const dark = parse(block(':root[data-theme="dark"]'));
const mediaDark = parse(block(':root:not([data-theme="light"])'));

const AA: [string, string][] = [
  ["text", "bg"],
  ["text", "surface"],
  ["text-muted", "surface"],
  ["text-muted", "bg"],
  ["primary-text", "primary"],
  ["danger", "surface"],
  ["danger-text", "danger"],
  ["danger", "danger-bg"],
  ["text", "band"],
  ["menu-text", "menu-bg"],
  ["text", "info-bg"],
];
const NON_TEXT: [string, string][] = [
  ["border", "surface"],
  ["border", "bg"],
  ["focus", "bg"],
  ["focus", "surface"],
  ["focus", "primary"],
  ["focus", "menu-bg"],
];

const themes = { light, dark } as const;

describe("theme tokens", () => {
  test("the media-query dark block and the data-theme dark block are identical", () => {
    expect(Object.keys(dark).length).toBeGreaterThan(10);
    expect(mediaDark).toEqual(dark);
  });

  test("both themes define every colour token the light theme does", () => {
    const colours = Object.keys(light).filter((k) => k.startsWith("--color-"));
    for (const name of colours) {
      expect(dark, name).toHaveProperty([name]);
    }
  });

  describe.each(["light", "dark"] as const)("%s", (name) => {
    const t = themes[name];
    const ratio = (fg: string, bg: string) =>
      contrastRatio(t[`--color-${fg}`] ?? "", t[`--color-${bg}`] ?? "");

    test.each(AA)("%s on %s meets 4.5:1", (fg, bg) => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    test.each(NON_TEXT)("%s on %s meets 3:1", (fg, bg) => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
    });
  });

  test("light theme never uses amber as text", () => {
    const amber = light["--color-primary"] ?? "";
    for (const [name, value] of Object.entries(light)) {
      if (name.endsWith("-text")) expect(value, name).not.toBe(amber);
    }
  });

  test("no stylesheet uses amber as text colour", () => {
    const root = join(__dirname, "..");
    const sheets = (readdirSync(root, { recursive: true }) as string[]).filter((f) =>
      f.endsWith(".module.css"),
    );
    expect(sheets.length).toBeGreaterThan(5);
    for (const sheet of sheets) {
      const text = readFileSync(join(root, sheet), "utf8");
      expect(text, sheet).not.toMatch(/(^|[;{\s])color\s*:\s*var\(--color-primary\)/);
    }
  });

  test("contrastRatio matches known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(Math.abs(contrastRatio("#2b2118", "#fffaf0") - 15.1)).toBeLessThan(0.1);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const source = readFileSync(join(__dirname, "../../public/theme-init.js"), "utf8");
const run = () => new Function(source)();

describe("theme-init.js", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test.each(["dark", "light"])("stored %s sets data-theme", (value) => {
    localStorage.setItem("gf-theme", value);
    run();
    expect(document.documentElement.dataset.theme).toBe(value);
  });

  test("nothing stored sets no data-theme", () => {
    run();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  test("an unknown stored value sets no data-theme", () => {
    localStorage.setItem("gf-theme", "purple");
    run();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  test("blocked storage neither throws nor sets data-theme", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});

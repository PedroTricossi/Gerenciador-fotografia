import { type Page } from "@playwright/test";
import { expect, test } from "./helpers";

const LIGHT_BG = "rgb(243, 234, 215)"; // --color-bg, light
const DARK_BG = "rgb(29, 26, 22)"; // --color-bg, dark

const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("first load follows the Mac", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/agenda");
  expect(await background(page)).toBe(DARK_BG);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
});

test("Automático follows a live change", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/agenda");
  expect(await background(page)).toBe(DARK_BG);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => background(page)).toBe(LIGHT_BG);
});

test("the switch survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/agenda");
  const nav = page.getByRole("navigation", { name: "Principal" });
  await nav.getByRole("button", { name: /^Tema: Automático/ }).click(); // Claro
  await nav.getByRole("button", { name: /^Tema: Claro/ }).click(); // Escuro
  await expect(nav.getByRole("button", { name: /^Tema: Escuro/ })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
    "dark",
  );
  await expect(page.locator("body")).toBeVisible();
  expect(await background(page)).toBe(DARK_BG);
});

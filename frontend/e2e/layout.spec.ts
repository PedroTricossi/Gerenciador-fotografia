import { type Page } from "@playwright/test";
import { createLongNamedContract, expect, test, uniqueSuffix } from "./helpers";

const WIDTHS = [400, 800, 1024, 1280, 1440];
const SCREENS = ["/agenda", "/contratos", "/contratos/novo", "/clientes", "/servicos"];

let contractId = "";

test.beforeAll(async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL });
  for (const service of [
    { name: "Cobertura da cerimônia na igreja", default_price_cents: 120000, is_prewedding: false },
    { name: "Diária segundo fotógrafo", default_price_cents: 50000, is_prewedding: false },
  ]) {
    await page.request.post("/api/v1/services", { data: service, headers: { Origin: baseURL! } });
  }
  const longService = await page.request.post("/api/v1/services", {
    data: {
      name: `Cobertura completa estendida com making of, cerimônia, recepção e festa ${uniqueSuffix()}`,
      default_price_cents: 99000,
      is_prewedding: false,
    },
    headers: { Origin: baseURL! },
  });
  expect(longService.status()).toBe(201);
  contractId = (await createLongNamedContract(page)).id;
  await page.close();
});

async function expectNoOverflow(page: Page, where: string) {
  const result = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const box = main.getBoundingClientRect();
    const offenders: string[] = [];
    for (const element of main.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      // The table scroller is a deliberate scroll container: its box is judged, its contents scroll.
      const scroller = element.parentElement?.closest("[role='region'][tabindex='0']");
      if (scroller && main.contains(scroller)) continue;
      if (rect.left < box.left - 1 || rect.right > box.right + 1) {
        offenders.push(
          `${element.tagName.toLowerCase()}.${String(element.className)} "${(element.textContent ?? "").slice(0, 30)}" ${Math.round(rect.left)}-${Math.round(rect.right)} vs main ${Math.round(box.left)}-${Math.round(box.right)}`,
        );
      }
    }
    return {
      offenders,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  expect(result.offenders, `${where}: elements outside main`).toEqual([]);
  expect(result.scrollWidth, `${where}: page scrolls sideways`).toBeLessThanOrEqual(
    result.innerWidth,
  );
}

async function expectChipsInsideCells(page: Page, where: string) {
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const chip of document.querySelectorAll("td a")) {
      const cell = chip.closest("td")!.getBoundingClientRect();
      const rect = chip.getBoundingClientRect();
      if (
        rect.left < cell.left - 1 ||
        rect.right > cell.right + 1 ||
        rect.top < cell.top - 1 ||
        rect.bottom > cell.bottom + 1
      ) {
        out.push(chip.getAttribute("aria-label") ?? "chip");
      }
    }
    return out;
  });
  expect(bad, `${where}: chips outside their day cell`).toEqual([]);
}

async function expectChipMetaGap(page: Page, where: string) {
  const gaps = await page.evaluate(() =>
    [...document.querySelectorAll("td li")].flatMap((chip) => {
      const meta = chip.firstElementChild;
      const link = chip.querySelector("a");
      if (!meta || meta === link || !link) return [];
      return [link.getBoundingClientRect().left - meta.getBoundingClientRect().right];
    }),
  );
  expect(gaps.length, `${where}: a chip with meta text`).toBeGreaterThan(0);
  for (const gap of gaps)
    expect(gap, `${where}: gap between meta and couple`).toBeGreaterThanOrEqual(2);
}

async function checkAll(page: Page, tag: string, rootFont = false) {
  const go = async (path: string) => {
    await page.goto(path);
    if (rootFont) {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "20px";
      });
    }
  };
  const paths = [...SCREENS, `/contratos/${contractId}`];
  for (const path of paths) {
    await go(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoOverflow(page, `${tag} ${path}`);
  }
  await go("/agenda");
  await page.getByRole("button", { name: "Calendário" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expectNoOverflow(page, `${tag} /agenda calendar`);
  if ((page.viewportSize()?.width ?? 0) > 640) {
    await expect(page.getByRole("table").getByRole("link").first()).toBeVisible();
    await expectChipsInsideCells(page, `${tag} /agenda calendar`);
    await expectChipMetaGap(page, `${tag} /agenda calendar`);
  }
}

for (const width of WIDTHS) {
  test(`nothing overflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await checkAll(page, `${width}px`);
  });
}

test("nothing overflows at 1280px with a 20px root font", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await checkAll(page, "20px root", true);
});

// Full-page screenshots for the visual check; test-results/ is git-ignored.
for (const colorScheme of ["light", "dark"] as const) {
  test(`screenshots at 1280px, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width: 1280, height: 900 });
    const screens: [string, string][] = [
      ["agenda-list", "/agenda"],
      ["contratos", "/contratos"],
      ["contrato-novo", "/contratos/novo"],
      ["contrato-editar", `/contratos/${contractId}`],
      ["clientes", "/clientes"],
      ["servicos", "/servicos"],
    ];
    for (const [name, path] of screens) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: `test-results/screens/${name}-${colorScheme}.png`,
        fullPage: true,
      });
    }
    await page.goto("/agenda");
    await page.getByRole("button", { name: "Calendário" }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `test-results/screens/agenda-calendario-${colorScheme}.png`,
      fullPage: true,
    });
  });
}

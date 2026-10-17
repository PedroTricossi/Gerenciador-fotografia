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

async function expectTableWordsWhole(page: Page, where: string) {
  // Headers and buttons may wrap between words when text is large, but never inside a word.
  const split = await page.evaluate(() => {
    const out: string[] = [];
    const elements = [...document.querySelectorAll("main table th, main table button")];
    for (const el of elements) {
      const style = getComputedStyle(el);
      const room =
        el.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderLeftWidth) -
        parseFloat(style.borderRightWidth);
      for (const word of (el.textContent ?? "").split(/[\s-]+/)) {
        if (word.length === 0) continue;
        const probe = document.createElement("span");
        probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
        probe.textContent = word;
        el.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        if (width > room + 0.5)
          out.push(`${el.tagName.toLowerCase()} word "${word}" needs ${width}px, has ${room}px`);
      }
    }
    return { out, count: elements.length };
  });
  expect(split.count, `${where}: found headers and buttons`).toBeGreaterThan(0);
  expect(split.out, `${where}: a header or button word split`).toEqual([]);

  const multiline = await page.evaluate(() => {
    const out: string[] = [];
    const cells: Element[] = [];
    // The seeded row's date and money cells: formatted as dd/mm/yyyy or R$ 1.234,56.
    for (const td of document.querySelectorAll("main table td")) {
      const text = (td.textContent ?? "").trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(text) || /^R\$\s?[\d.]+,\d{2}$/.test(text)) cells.push(td);
    }
    for (const el of cells) {
      // Measure the text itself: a cell is as tall as its row, which a wrapping neighbour can stretch.
      const range = document.createRange();
      range.selectNodeContents(el);
      const height = range.getBoundingClientRect().height;
      const line = parseFloat(getComputedStyle(el).lineHeight);
      if (height >= 2 * line - 1)
        out.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim()}" text is ${height}px tall`,
        );
    }
    return { out, count: cells.length };
  });
  expect(multiline.count, `${where}: found date and money cells`).toBeGreaterThan(0);
  expect(multiline.out, `${where}: a date or amount broken over several lines`).toEqual([]);
}

async function expectWrapCellsAndButtonsFit(page: Page, where: string) {
  const result = await page.evaluate(() => {
    const problems: string[] = [];
    const region = document
      .querySelector("main [role='region'][tabindex='0']")!
      .getBoundingClientRect();
    let wrapCells = 0;
    for (const td of document.querySelectorAll("main table td")) {
      const style = getComputedStyle(td);
      if (style.overflowWrap !== "anywhere") continue; // only the free-text columns wrap
      wrapCells += 1;
      const room =
        td.getBoundingClientRect().width -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      for (const word of (td.textContent ?? "").split(/\s+/)) {
        if (word.length === 0 || word.length > 20) continue;
        const probe = document.createElement("span");
        probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
        probe.textContent = word;
        td.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        if (width > room + 0.5) problems.push(`"${word}" needs ${width}px, cell has ${room}px`);
      }
    }
    // Text measures a few percent wider on some platforms (Linux rounds glyph advances), so the
    // table's narrowest layout must leave room to spare, not fit by a hair.
    const table = document.querySelector("main table") as HTMLElement;
    const wrapBox = table.parentElement as HTMLElement;
    table.style.width = "min-content";
    const minWidth = table.getBoundingClientRect().width;
    table.style.width = "";
    const SAFETY = 32;
    if (minWidth > wrapBox.clientWidth - SAFETY)
      problems.push(
        `table needs ${minWidth}px at its narrowest, box has ${wrapBox.clientWidth}px (want ${SAFETY}px spare)`,
      );
    for (const button of document.querySelectorAll("main table button")) {
      const rect = button.getBoundingClientRect();
      if (rect.left < region.left - 0.5 || rect.right > region.right + 0.5)
        problems.push(
          `button "${(button.textContent ?? "").trim()}" ${rect.left}-${rect.right} outside table ${region.left}-${region.right}`,
        );
    }
    return { problems, wrapCells };
  });
  expect(result.wrapCells, `${where}: free-text cells found`).toBeGreaterThan(0);
  expect(result.problems, `${where}: split words or buttons outside the table`).toEqual([]);
}

for (const rootFont of [false, true]) {
  test(`table headers, buttons, dates and money stay on one line at 1280px${rootFont ? " with a 20px root font" : ""}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const path of ["/contratos", "/clientes", "/servicos"]) {
      await page.goto(path);
      if (rootFont) {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "20px";
        });
      }
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("table")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectTableWordsWhole(page, `${rootFont ? "20px " : ""}${path}`);
      await expectWrapCellsAndButtonsFit(page, `${rootFont ? "20px " : ""}${path}`);
    }
  });
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

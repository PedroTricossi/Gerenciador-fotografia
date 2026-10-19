import AxeBuilder from "@axe-core/playwright";
import { type Page } from "@playwright/test";
import {
  createLongNamedContract,
  createSplitContract,
  expect,
  fillContract,
  freshCouple,
  test,
} from "./helpers";

function localIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations).toEqual([]);
}

let contractId = "";

test.beforeAll(async ({ browser, baseURL }) => {
  // One contract with a pre-wedding item gives the contract page and both dialogs something to open.
  const page = await browser.newPage({ baseURL });
  await page.request.post("/api/v1/services", {
    data: { name: "Ensaio de pré-wedding", default_price_cents: 80000, is_prewedding: true },
    headers: { Origin: baseURL! },
  });
  await page.request.post("/api/v1/services", {
    data: {
      name: "Cobertura da cerimônia na igreja",
      default_price_cents: 120000,
      is_prewedding: false,
    },
    headers: { Origin: baseURL! },
  });
  await page.request.post("/api/v1/services", {
    data: { name: "Diária segundo fotógrafo", default_price_cents: 50000, is_prewedding: false },
    headers: { Origin: baseURL! },
  });
  contractId = (await createLongNamedContract(page)).id;
  // Three more events today, so today's calendar cell overflows into a "+N mais" button.
  for (let n = 0; n < 3; n += 1) {
    await page.goto("/contratos/novo");
    await fillContract(page, freshCouple());
    await page.getByLabel("Data do evento").fill(localIso(new Date()));
    const saved = page.waitForEvent("download");
    await page.getByRole("button", { name: "Salvar" }).click();
    await saved;
    await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/);
  }
  await page.goto("/contratos/novo");
  await fillContract(page, freshCouple());
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Serviço do item 3").selectOption({ label: "Ensaio de pré-wedding" });
  await page.getByLabel("Data do pré-wedding").fill(localIso(new Date()));
  await page.getByLabel("Local do pré-wedding").fill("Parque Barigui");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar" }).click();
  await download;
  // A second one with the pre-wedding still unscheduled, for the "Agendar pré-wedding" dialog.
  await page.goto("/contratos/novo");
  await fillContract(page, freshCouple());
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Serviço do item 3").selectOption({ label: "Ensaio de pré-wedding" });
  const second = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar" }).click();
  await second;
  // A split contract gives /negocio rows to scan.
  await createSplitContract(page, freshCouple());
  await page.close();
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 400, height: 800 },
  ]) {
    test.describe(`${colorScheme} ${viewport.width}px`, () => {
      test.use({ colorScheme, viewport });

      const screens: [string, string][] = [
        ["/agenda list", "/agenda"],
        ["/contratos", "/contratos"],
        ["/contratos/novo", "/contratos/novo"],
        ["/clientes", "/clientes"],
        ["/servicos", "/servicos"],
        ["/negocio", "/negocio"],
      ];
      for (const [name, path] of screens) {
        test(`${name} has no accessibility violations`, async ({ page }) => {
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await audit(page);
        });
      }

      test("/agenda calendar has no accessibility violations", async ({ page }) => {
        await page.goto("/agenda");
        await page.getByRole("button", { name: "Calendário" }).click();
        await expect(page.getByRole("table")).toBeVisible();
        // Four or more entries on one day show the "+N mais" button; it is only drawn on wide screens.
        if (viewport.width > 640) {
          await expect(page.getByRole("button", { name: /^\+\d+ mais$/ }).first()).toBeVisible();
        }
        await audit(page);
      });

      test("/contratos/novo with Parcelado has no accessibility violations", async ({ page }) => {
        await page.goto("/contratos/novo");
        await page.getByRole("button", { name: "Parcelado" }).click();
        await expect(page.getByLabel("Mês da parcela 1")).toBeVisible();
        await audit(page);
      });

      test("/contratos/<id> has no accessibility violations", async ({ page }) => {
        await page.goto(`/contratos/${contractId}`);
        await expect(page.getByLabel("Local do evento")).toBeVisible();
        await audit(page);
      });

      test("the anonymise dialog has no accessibility violations", async ({ page }) => {
        await page.goto("/clientes");
        await page.getByRole("button", { name: "Anonimizar" }).first().click();
        await expect(page.getByRole("dialog", { name: "Anonimizar cliente" })).toBeVisible();
        await audit(page);
      });

      test("the pre-wedding dialog has no accessibility violations", async ({ page }) => {
        await page.goto("/contratos");
        await page.getByRole("button", { name: "Agendar pré-wedding" }).first().click();
        await expect(page.getByRole("dialog", { name: "Pré-wedding" })).toBeVisible();
        await audit(page);
      });
    });
  }
}

import { type Page } from "@playwright/test";
import {
  type Couple,
  createTwoPhotographerContract,
  expect,
  freshCouple,
  test,
  uniqueSuffix,
} from "./helpers";

function feeRow(page: Page, couple: Couple) {
  return page.getByRole("row").filter({ hasText: `2º fotógrafo · ${couple.label}` });
}

async function openExpenses(page: Page) {
  await page.goto("/negocio?aba=despesas");
  await expect(page.getByRole("button", { name: "+ Nova despesa" })).toBeVisible();
}

async function setStandardFee(page: Page, amount: string) {
  const settings = page.getByRole("region", { name: "Configurações" });
  await settings.getByRole("button", { name: "Alterar" }).click();
  const dialog = page.getByRole("dialog", { name: "2º fotógrafo (padrão)" });
  await dialog.getByLabel("Valor").fill(amount);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Valor padrão alterado")).toBeVisible();
  await expect(dialog).toBeHidden();
}

test("a transport expense shows its trip details in the month list", async ({ page }) => {
  const couple = freshCouple();
  await createTwoPhotographerContract(page, couple);
  await openExpenses(page);

  await page.getByRole("button", { name: "+ Nova despesa" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova despesa" });
  await dialog.getByLabel("Valor", { exact: true }).fill("45,90");
  await dialog.getByLabel("Tipo").selectOption({ label: "Transporte" });
  const wedding = dialog.getByLabel("Casamento ou pré-wedding");
  const value = await wedding
    .locator("option", { hasText: `${couple.label} · casamento` })
    .getAttribute("value");
  await wedding.selectOption(value!);
  await dialog.getByLabel("Meio de transporte").selectOption({ label: "App (Uber/99)" });
  await dialog.getByLabel("Saí de casa às").fill("13:30");
  await dialog.getByLabel("Distância (km)").fill("32");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Despesa salva")).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: `casamento ${couple.label}` });
  await expect(row).toContainText("App (Uber/99)");
  await expect(row).toContainText("32 km");
  await expect(row).toContainText("saí 13:30");
  await expect(row).toContainText("R$ 45,90");
});

test("the standard fee and a fixed cost land in the month, tagged and totalled", async ({
  page,
}) => {
  const couple = freshCouple();
  await createTwoPhotographerContract(page, couple);
  await openExpenses(page);
  await setStandardFee(page, "500,00");

  const name = `Adobe ${uniqueSuffix()}`;
  await page
    .getByRole("region", { name: "Configurações" })
    .getByRole("button", { name: "Gerenciar" })
    .click();
  const fixed = page.getByRole("dialog", { name: "Despesas fixas" });
  await fixed.getByLabel("Nome", { exact: true }).fill(name);
  await fixed.getByLabel("Dia").fill("1");
  await fixed.getByLabel("Valor", { exact: true }).fill("124,00");
  await fixed.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Despesa fixa criada")).toBeVisible();
  await fixed.getByRole("button", { name: "Fechar" }).click();

  const fee = feeRow(page, couple);
  await expect(fee).toContainText("automática");
  await expect(fee).toContainText("R$ 500,00");
  const cost = page.getByRole("row").filter({ hasText: name });
  await expect(cost).toContainText("fixa");
  await expect(cost).toContainText("R$ 124,00");

  // The total is the sum of the visible amounts; other specs may add rows to the month.
  const table = page.getByRole("table", { name: /^Despesas de/ });
  const amounts = await table.getByRole("row").evaluateAll((rows) =>
    rows.flatMap((row) => {
      const cells = [...row.querySelectorAll("td")];
      const text = cells.find((cell) =>
        /^R\$\s?[\d.]+,\d{2}$/.test(cell.textContent?.trim() ?? ""),
      )?.textContent;
      return text ? [text.trim()] : [];
    }),
  );
  const cents = amounts.map((text) => Number(text.replace(/[^\d]/g, "")));
  expect(cents.length).toBeGreaterThanOrEqual(2);
  const total = cents.reduce((sum, value) => sum + value, 0);
  const shown = (await page.getByText(/^Total de /).innerText()).replace(/[^\d,]/g, "").split(",");
  const shownCents = Number(shown[0]!.replace(/\D/g, "")) * 100 + Number(shown[1]);
  expect(shownCents).toBe(total);
});

test("adjusting one wedding's fee leaves the standard alone", async ({ page }) => {
  const couple = freshCouple();
  await createTwoPhotographerContract(page, couple);
  await openExpenses(page);
  await setStandardFee(page, "500,00");

  await feeRow(page, couple)
    .getByRole("button", { name: /^Ajustar/ })
    .click();
  const dialog = page.getByRole("dialog", { name: /^2º fotógrafo · / });
  await dialog.getByLabel("Valor para este casamento").fill("650,00");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Valor do casamento salvo")).toBeVisible();

  await expect(feeRow(page, couple)).toContainText("R$ 650,00");
  await expect(
    page.getByRole("region", { name: "Configurações" }).getByText(/2º fotógrafo \(padrão\)/),
  ).toContainText("R$ 500,00");
});

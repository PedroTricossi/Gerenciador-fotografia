import { type Page } from "@playwright/test";
import {
  type Couple,
  createSplitContract,
  createTwoPhotographerContract,
  expect,
  freshCouple,
  test,
  uniqueSuffix,
} from "./helpers";

/** Cents in "R$ 1.234,56" or "−R$ 1,00". */
function toCents(text: string): number {
  const digits = Number(text.replace(/\D/g, ""));
  return text.trim().startsWith("−") ? -digits : digits;
}

async function openTab(page: Page, tab: "resumo" | "extrato") {
  await page.goto(`/negocio?aba=${tab}`);
  await expect(page.getByRole("group", { name: "Período" })).toBeVisible();
}

async function total(page: Page, label: string): Promise<number> {
  const value = page.getByText(label, { exact: true }).locator("xpath=following-sibling::div");
  await expect(value).toHaveText(/R\$/);
  return toCents(await value.innerText());
}

async function freeToday(page: Page): Promise<number> {
  const value = page
    .getByRole("heading", { name: /^Livre hoje/ })
    .locator("xpath=following-sibling::div");
  await expect(value).toHaveText(/R\$/);
  return toCents((await value.innerText()).replace("⚠", ""));
}

function instalmentRow(page: Page, couple: Couple, number: number) {
  return page
    .getByRole("listitem")
    .filter({ hasText: couple.label })
    .filter({ hasText: new RegExp(`${number}/3`) });
}

async function markFirstPaid(page: Page, couple: Couple) {
  await page.goto("/negocio");
  const first = instalmentRow(page, couple, 1);
  await first.getByRole("button", { name: "Marcar como paga" }).click();
  await expect(first).toContainText("✓ paga em");
}

async function addExpense(
  page: Page,
  fields: (dialog: ReturnType<Page["getByRole"]>) => Promise<void>,
) {
  await page.goto("/negocio?aba=despesas");
  await page.getByRole("button", { name: "+ Nova despesa" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova despesa" });
  await fields(dialog);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Despesa salva")).toBeVisible();
}

test("a paid instalment and an expense show in Resumo and in Extrato", async ({ page }) => {
  const couple = freshCouple();
  const note = `cafe ${uniqueSuffix()}`;

  await openTab(page, "resumo");
  const inBefore = await total(page, "Entrou");
  const outBefore = await total(page, "Saiu");

  await createSplitContract(page, couple);
  await markFirstPaid(page, couple);
  await addExpense(page, async (dialog) => {
    await dialog.getByLabel("Valor", { exact: true }).fill("23,40");
    await dialog.getByLabel("Tipo").selectOption({ label: "Café" });
    await dialog.getByLabel("Descrição (opcional)").fill(note);
  });

  await openTab(page, "resumo");
  // R$ 1.400,00 in three: the first instalment is 466,66.
  expect(await total(page, "Entrou")).toBe(inBefore + 46666);
  expect(await total(page, "Saiu")).toBe(outBefore + 2340);
  const livreHoje = await freeToday(page);

  await openTab(page, "extrato");
  const table = page.getByRole("table", { name: "Extrato" });
  const paid = table.getByRole("row").filter({ hasText: `Parcela 1/3 · ${couple.label}` });
  await expect(paid).toContainText("466,66");
  const spent = table.getByRole("row").filter({ hasText: note });
  await expect(spent).toContainText("23,40");

  const last = table.getByRole("row").last().getByRole("cell").last();
  expect(toCents(await last.innerText())).toBe(livreHoje);
});

test("two transport legs of one wedding make one trip costing their sum", async ({ page }) => {
  const couple = freshCouple();
  await createTwoPhotographerContract(page, couple);

  const leg = (amount: string, km: string) => async (dialog: ReturnType<Page["getByRole"]>) => {
    await dialog.getByLabel("Valor", { exact: true }).fill(amount);
    await dialog.getByLabel("Tipo").selectOption({ label: "Transporte" });
    const wedding = dialog.getByLabel("Casamento ou pré-wedding");
    const value = await wedding
      .locator("option", { hasText: `${couple.label} · casamento` })
      .getAttribute("value");
    await wedding.selectOption(value!);
    await dialog.getByLabel("Meio de transporte").selectOption({ label: "App (Uber/99)" });
    await dialog.getByLabel("Saí de casa às").fill("13:30");
    await dialog.getByLabel("Distância (km)").fill(km);
  };
  await addExpense(page, leg("45,00", "40"));
  await addExpense(page, leg("30,00", "12"));

  await openTab(page, "resumo");
  const guide = page.getByRole("group", { name: "Guia de transporte" });
  await guide.getByLabel("Distância (km)").fill("40");
  await guide.getByRole("button", { name: "Ver estimativa" }).click();
  const trips = guide.getByRole("list", { name: "Viagens parecidas" }).getByRole("listitem");
  const mine = trips.filter({ hasText: `${couple.groom} & ${couple.bride}` });
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText("R$ 75,00");
});

test("a paid instalment's successor shows under the next month's A receber", async ({ page }) => {
  const couple = freshCouple();

  await openTab(page, "resumo");
  const before = await nextReceivable(page);

  await createSplitContract(page, couple);
  await markFirstPaid(page, couple);

  await openTab(page, "resumo");
  // R$ 1.400,00 in three: the second instalment, due next month, is also 466,66.
  expect(await nextReceivable(page)).toBe(before + 46666);
});

/** "A receber" of the first row of Próximos meses that is a whole month. */
async function nextReceivable(page: Page): Promise<number> {
  const rows = page.getByRole("table", { name: "Próximos meses" }).getByRole("row");
  await expect(rows.nth(1)).toBeVisible();
  const whole = rows.filter({ hasNotText: /resto de/ }).filter({ has: page.getByRole("cell") });
  return toCents(await whole.first().getByRole("cell").nth(1).innerText());
}

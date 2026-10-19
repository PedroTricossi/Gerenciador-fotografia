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

/** Cents of the first amount in the text: "R$ 1.234,56", "−R$ 1,00" or a bare "1,00". */
function toCents(text: string): number {
  const match = /(−?)\s*(?:R\$\s?)?(\d[\d.]*),(\d{2})/.exec(text);
  if (!match) throw new Error(`no amount in "${text}"`);
  const cents = Number(match[2]!.replace(/\./g, "")) * 100 + Number(match[3]);
  return match[1] ? -cents : cents;
}

async function openTab(page: Page, tab: "resumo" | "extrato") {
  await page.goto(`/negocio?aba=${tab}`);
  await expect(page.getByRole("group", { name: "Período" })).toBeVisible();
}

async function total(page: Page, label: string): Promise<number> {
  const card = page.getByText(label, { exact: true }).locator("..");
  await expect(card).toContainText("R$");
  return toCents(await card.innerText());
}

async function freeToday(page: Page): Promise<number> {
  const box = page.getByRole("region", { name: /^Livre hoje/ });
  await expect(box).toContainText("R$");
  return toCents(await box.innerText());
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
  const mine = trips.filter({ hasText: couple.label });
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText("R$ 75,00");
});

/** "novembro" or "janeiro 2027": how the app names a month other than the current one. */
function monthText(date: Date): string {
  const name = date.toLocaleDateString("pt-BR", { month: "long" });
  return date.getFullYear() === new Date().getFullYear() ? name : `${name} ${date.getFullYear()}`;
}

/** "A receber" of the row of Próximos meses with this label, 0 when there is no such row. */
async function receivable(page: Page, label: RegExp): Promise<number> {
  const table = page.getByRole("table", { name: "Próximos meses" });
  await expect(table.getByRole("row").nth(1)).toBeVisible();
  const row = table.getByRole("row").filter({ hasText: label });
  if ((await row.count()) === 0) return 0;
  return toCents(await row.first().getByRole("cell").nth(1).innerText());
}

test("marking an instalment paid moves it from A receber to Entrou, not the next month's", async ({
  page,
}) => {
  const couple = freshCouple();
  const now = new Date();
  const nextMonth = monthText(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const thisMonth = now.toLocaleDateString("pt-BR", { month: "long" });
  const nextLabel = new RegExp(`^\\s*${nextMonth}`, "i");
  const restLabel = new RegExp(`resto de ${thisMonth}`, "i");

  await createSplitContract(page, couple);

  // R$ 1.400,00 in three (466,66 each): the first is due this month, the second next month.
  await page.goto("/negocio");
  await expect(
    page.getByRole("list", { name: new RegExp(`^${thisMonth}$`, "i") }).filter({
      has: instalmentRow(page, couple, 1),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: new RegExp(`^${nextMonth}$`, "i") }).filter({
      has: instalmentRow(page, couple, 2),
    }),
  ).toBeVisible();

  await openTab(page, "resumo");
  const entered = await total(page, "Entrou");
  const free = await freeToday(page);
  const rest = await receivable(page, restLabel);
  const next = await receivable(page, nextLabel);

  await markFirstPaid(page, couple);

  await openTab(page, "resumo");
  expect(await total(page, "Entrou")).toBe(entered + 46666);
  expect(await freeToday(page)).toBe(free + 46666);
  expect(await receivable(page, restLabel)).toBe(rest - 46666);
  expect(await receivable(page, nextLabel)).toBe(next);
});

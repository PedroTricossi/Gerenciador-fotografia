import { expect, fillContract, freshCouple, test } from "./helpers";

function localIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localIso(date);
}

test("the agenda opens first and shows a contract's wedding and pre-wedding", async ({ page }) => {
  const couple = freshCouple();
  const prewedding = inDays(1);
  const wedding = inDays(3);

  await page.goto("/contratos/novo");
  await fillContract(page, couple);
  await page.getByLabel("Data do evento").fill(wedding);
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Serviço do item 3").selectOption({ label: "Ensaio de pré-wedding" });
  await page.getByLabel("Data do pré-wedding").fill(prewedding);
  await page.getByLabel("Local do pré-wedding").fill("Parque Barigui");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar" }).click();
  await download;
  await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/);
  const contractUrl = page.url();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Agenda" })).toBeVisible();
  const weddingLink = new RegExp(`^${couple.label}, Casamento`);
  const preweddingLink = new RegExp(`^${couple.label}, Pré-wedding`);
  await expect(page.getByRole("link", { name: weddingLink })).toBeVisible();
  await expect(page.getByRole("link", { name: preweddingLink })).toBeVisible();

  await page.getByRole("button", { name: "Calendário" }).click();
  const grid = page.getByRole("table");
  let shownMonth = localIso(new Date()).slice(0, 7);
  for (const [date, link] of [
    [prewedding, preweddingLink],
    [wedding, weddingLink],
  ] as const) {
    if (date.slice(0, 7) !== shownMonth) {
      await page.getByRole("button", { name: "Próximo mês" }).click();
      shownMonth = date.slice(0, 7);
    }
    await expect(grid.getByRole("link", { name: link })).toBeVisible();
  }

  await grid.getByRole("link", { name: weddingLink }).click();
  await expect(page).toHaveURL(contractUrl);
});

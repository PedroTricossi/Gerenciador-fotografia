import { expect, fillContract, freshCouple, test } from "./helpers";

test("schedule a pre-wedding from the list, then cancel it by removing its item", async ({
  page,
}) => {
  const couple = freshCouple();
  await page.goto("/contratos/novo");
  await fillContract(page, couple);
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Serviço do item 3").selectOption({ label: "Ensaio de pré-wedding" });
  await expect(page.getByText("Pode deixar em branco e agendar depois.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar" }).click();
  await download;
  await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/);
  const contractUrl = page.url();
  await expect(page.getByText("Pré-wedding: não agendado")).toBeVisible();

  await page.goto("/contratos");
  const row = page.getByRole("row", { name: new RegExp(couple.label) });
  await row.getByRole("button", { name: "Agendar pré-wedding" }).click();
  const dialog = page.getByRole("dialog", { name: "Pré-wedding" });
  await dialog.getByLabel("Data").fill("2027-01-20");
  await dialog.getByLabel("Local").fill("Parque Barigui");
  await dialog.getByLabel("Horário").fill("16:00");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Pré-wedding agendado")).toBeVisible();
  await expect(row.getByRole("button", { name: "Pré-wedding 20/01" })).toBeVisible();

  await page.goto(contractUrl);
  await expect(page.getByText("Pré-wedding: 20/01/2027 às 16:00 · Parque Barigui")).toBeVisible();
  await page.getByRole("button", { name: "Remover item 3" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("button", { name: "Remover e salvar" }).click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();

  await page.goto("/contratos");
  await expect(
    page.getByRole("row", { name: new RegExp(couple.label) }).getByRole("button", {
      name: /pré-wedding/i,
    }),
  ).toHaveCount(0);
});

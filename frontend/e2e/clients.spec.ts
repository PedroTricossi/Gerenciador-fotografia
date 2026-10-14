import { readFile } from "node:fs/promises";
import { createContract, expect, freshCouple, test } from "./helpers";

test("a client on no active contract can be exported and anonymised", async ({ page }) => {
  const couple = freshCouple();
  await createContract(page, couple);

  // Anonymising is refused while the contract is active, so delete it first.
  await page.getByRole("link", { name: "Contratos" }).click();
  await page
    .getByRole("row", { name: new RegExp(couple.label) })
    .getByRole("button", { name: "Excluir" })
    .click();
  await page
    .getByRole("dialog", { name: "Excluir contrato" })
    .getByRole("button", { name: "Excluir" })
    .click();
  await expect(page.getByText("Contrato excluído")).toBeVisible();

  await page.getByRole("link", { name: "Clientes" }).click();
  const row = page.getByRole("row", { name: new RegExp(couple.groom) });

  const download = page.waitForEvent("download");
  await row.getByRole("button", { name: "Exportar dados" }).click();
  const exported = JSON.parse(await readFile(await (await download).path(), "utf-8"));
  expect(exported.client.full_name).toBe(couple.groom);
  expect(exported.contracts).toHaveLength(1);

  await row.getByRole("button", { name: "Anonimizar" }).click();
  const dialog = page.getByRole("dialog", { name: "Anonimizar cliente" });
  await dialog.getByLabel("Digite ANONIMIZAR para confirmar").fill("ANONIMIZAR");
  await dialog.getByRole("button", { name: "Anonimizar" }).click();
  await expect(page.getByText("Cliente anonimizado com sucesso")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(couple.groom) })).toHaveCount(0);
});

import { createContract, expect, freshCouple, sha256, test } from "./helpers";

test("creating a contract downloads its PDF, matching the server's hash", async ({ page }) => {
  const { download, pdfResponse } = await createContract(page, freshCouple());
  expect(download.suggestedFilename()).toMatch(
    /^contrato-noivo[a-z]{6}-noiva[a-z]{6}-2027-03-14\.pdf$/,
  );
  expect(await sha256(download)).toBe(pdfResponse.headers()["x-content-sha256"]);
  await expect(page.getByText("Contrato salvo")).toBeVisible();
});

test("an edit survives a reload of the contract's own URL", async ({ page }) => {
  await createContract(page, freshCouple());
  await page.getByLabel("Local do evento").fill("Capela Santa Luzia");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Local do evento")).toHaveValue("Capela Santa Luzia");
});

test("a contract opens directly by URL, and a mistyped API path stays a JSON problem", async ({
  page,
}) => {
  const couple = freshCouple();
  const { id } = await createContract(page, couple);
  await page.goto(`/contratos/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(couple.label);

  const problem = await page.request.get("/api/v1/nao-existe");
  expect(problem.status()).toBe(404);
  expect(problem.headers()["content-type"]).toBe("application/problem+json");
});

test("a deleted contract can be restored with Desfazer", async ({ page }) => {
  const couple = freshCouple();
  await createContract(page, couple);
  await page.getByRole("link", { name: "Contratos" }).click();
  const row = page.getByRole("row", { name: new RegExp(couple.label) });
  await row.getByRole("button", { name: "Excluir" }).click();
  await page
    .getByRole("dialog", { name: "Excluir contrato" })
    .getByRole("button", { name: "Excluir" })
    .click();
  await expect(page.getByText("Contrato excluído")).toBeVisible();
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Contrato restaurado")).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(couple.label) })).toHaveCount(1);
});

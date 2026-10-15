import { expect, fillContract, freshCouple, test, uniqueSuffix } from "./helpers";

test("a renamed service keeps its old wording on a contract that already uses it", async ({
  page,
}) => {
  const name = `Drone ${uniqueSuffix()}`;
  await page.goto("/servicos");
  await page.getByRole("button", { name: "Novo serviço" }).click();
  const create = page.getByRole("dialog", { name: "Novo serviço" });
  await create.getByLabel("Nome").fill(name);
  await create.getByLabel("Preço padrão").fill("750");
  await create.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Serviço criado")).toBeVisible();

  await page.goto("/contratos/novo");
  await fillContract(page, freshCouple());
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Serviço do item 3").selectOption({ label: name });
  await expect(page.getByLabel("Valor do item 3")).toHaveValue("750,00");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar" }).click();
  await download;
  await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/);
  const contractUrl = page.url();
  const contractId = contractUrl.split("/").pop()!;

  await page.goto("/servicos");
  const row = page.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar serviço" });
  await edit.getByLabel("Nome").fill(`${name} Premium`);
  await edit.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Serviço atualizado")).toBeVisible();

  await page.goto(contractUrl);
  await page.getByLabel("Local do evento").fill("Capela Santa Luzia");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Alterações salvas")).toBeVisible();
  await expect(page.getByLabel("Serviço do item 3").locator("option:checked")).toHaveText(name);

  const saved = await (await page.request.get(`/api/v1/contracts/${contractId}`)).json();
  expect(saved.payment.items[2].description).toBe(name);
});

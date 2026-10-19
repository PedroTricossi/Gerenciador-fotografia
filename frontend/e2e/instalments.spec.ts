import { type Page } from "@playwright/test";
import { type Couple, createSplitContract, expect, freshCouple, test } from "./helpers";

function instalmentRow(page: Page, couple: Couple, number: number) {
  return page
    .getByRole("listitem")
    .filter({ hasText: couple.label })
    .filter({ hasText: new RegExp(`${number}/3`) });
}

test("a split contract's instalment is marked paid and unpaid on Negócio", async ({ page }) => {
  const couple = freshCouple();
  await createSplitContract(page, couple);

  await page.getByRole("link", { name: "Negócio" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Negócio" })).toBeVisible();
  const first = instalmentRow(page, couple, 1);
  await expect(first).toBeVisible();
  // R$ 1.400,00 in three: 466,66 / 466,66 / 466,68.
  await expect(first).toContainText("R$ 466,66");

  await first.getByRole("button", { name: "Marcar como paga" }).click();
  await expect(first).toContainText("✓ paga em");
  await first.getByRole("button", { name: "Desfazer" }).click();
  await expect(first.getByRole("button", { name: "Marcar como paga" })).toBeVisible();
  await expect(first).not.toContainText("✓ paga em");
});

test("the Agenda reminds about unpaid instalments in the month's last week", async ({ page }) => {
  const couple = freshCouple();
  await createSplitContract(page, couple);

  const now = new Date();
  await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth(), 27, 10, 0, 0));
  await page.goto("/agenda");
  const box = page.getByRole("region", { name: "Cobranças" });
  await expect(box).toBeVisible();
  await expect(
    box.getByRole("link", { name: new RegExp(`${couple.label} · 1/3 · R\\$`) }),
  ).toBeVisible();
});

test("a contract's instalments come back unchanged after delete and restore", async ({ page }) => {
  const couple = freshCouple();
  await createSplitContract(page, couple);

  await page.getByRole("link", { name: "Negócio" }).click();
  await instalmentRow(page, couple, 1).getByRole("button", { name: "Marcar como paga" }).click();
  await expect(instalmentRow(page, couple, 1)).toContainText("✓ paga em");
  const before = await page.getByRole("listitem").filter({ hasText: couple.label }).allInnerTexts();
  expect(before).toHaveLength(3);

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
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Contrato restaurado")).toBeVisible();

  await page.getByRole("link", { name: "Negócio" }).click();
  await expect(instalmentRow(page, couple, 1)).toContainText("✓ paga em");
  const after = await page.getByRole("listitem").filter({ hasText: couple.label }).allInnerTexts();
  expect(after).toEqual(before);
});

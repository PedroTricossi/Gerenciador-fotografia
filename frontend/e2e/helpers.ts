import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Download, type Page, test as base, expect } from "@playwright/test";
import { completeCpf } from "../src/domain/cpf";

// Every test fails on any browser console error, which is where CSP violations appear.
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "browser console errors (including CSP violations)").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

// Made-up CPFs: base 000000 plus a three-digit counter, with valid check digits.
let counter = Math.floor(Math.random() * 800) + 1;
export function freshCpf(): string {
  counter += 1;
  return completeCpf(`000000${String(counter).padStart(3, "0")}`);
}

function uniqueSuffix(): string {
  return Array.from(
    { length: 6 },
    () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)],
  ).join("");
}

export type Couple = {
  groom: string;
  bride: string;
  groomCpf: string;
  brideCpf: string;
  /** What the list and the edit page show: "Noivoabc & Noivaabc". */
  label: string;
};

// The list shows first names only, so the unique part goes into the first name.
export function freshCouple(): Couple {
  const suffix = uniqueSuffix();
  const groomFirst = `Noivo${suffix}`;
  const brideFirst = `Noiva${suffix}`;
  return {
    groom: `${groomFirst} Costa`,
    bride: `${brideFirst} Lima`,
    groomCpf: freshCpf(),
    brideCpf: freshCpf(),
    label: `${groomFirst} & ${brideFirst}`,
  };
}

export async function fillContract(page: Page, couple: Couple): Promise<void> {
  await page.getByLabel("Nome do noivo").fill(couple.groom);
  await page.getByLabel("CPF do noivo").fill(couple.groomCpf);
  await page.getByLabel("Nome da noiva").fill(couple.bride);
  await page.getByLabel("CPF da noiva").fill(couple.brideCpf);
  await page.getByLabel("Endereço do casal").fill("Rua das Flores 100");
  await page.getByLabel("Data do evento").fill("2027-03-14");
  await page.getByLabel("Local do evento").fill("Igreja Matriz");
  await page.getByLabel("Início da cobertura").fill("16:00");
  await page.getByLabel("Descrição do item 1").fill("Cobertura da cerimônia na igreja");
  await page.getByLabel("Valor do item 1").fill("1.200,00");
  await page.getByRole("button", { name: "Adicionar item" }).click();
  await page.getByLabel("Descrição do item 2").fill("Diária segundo fotógrafo");
  await page.getByLabel("Valor do item 2").fill("500");
  await page.getByLabel("Desconto PIX").fill("300");
}

/** Creates a contract through the form and returns its id and the downloaded PDF. */
export async function createContract(page: Page, couple: Couple) {
  await page.goto("/contratos/novo");
  await fillContract(page, couple);
  const pdfResponse = page.waitForResponse((response) => response.url().endsWith("/pdf"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/contratos\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  return { id, download: await download, pdfResponse: await pdfResponse };
}

export async function sha256(download: Download): Promise<string> {
  const path = await download.path();
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

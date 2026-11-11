import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { browserFamily, browserProfile, enterAgenda } from "./fixtures/compasso";

const CONVERSA = `26/09/2026 07:12 - Coordenação: Bom dia a todos!
27/09/2026 18:43 - Profa. Marina: Prova de Ciências em 02/10/2026.
Estudar capítulos 4 e 5.
27/09/2026 18:44 - Mãe da Bia: Obrigada, professora!`;

test("bringing a recado in without copying: WhatsApp export and the share fallback", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `share-whatsapp-${randomUUID()}`;
  const email = `${id}@e2e.local`;
  const f = await browserFamily({ id, email, password: "ShareWhats!Synthetic2026" });
  await browserProfile(f, "Criança navegador");
  await enterAgenda(page, f);
  // A conversa exportada vira uma lista para escolher — e só o escolhido
  // chega ao campo de texto. O grupo inteiro nunca sai do navegador.
  await page.goto("/recados/novo");
  // Escolher o arquivo antes de o React assumir o formulário perde o evento:
  // o `change` é disparado num input que ainda não tem ouvinte. Uma pessoa
  // leva segundos no seletor do sistema e nunca cai nisso; o teste cai.
  await expect(async () => {
    await page.locator("#notice-file").setInputFiles({
      name: "Conversa do WhatsApp com Turma.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(CONVERSA, "utf8"),
    });
    await expect(
      page.getByRole("heading", { name: "Escolha as mensagens do recado", exact: true }),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByText("Prova de Ciências em 02/10/2026.", { exact: false }).click();
  await page.getByRole("button", { name: "Usar 1 mensagem", exact: true }).click();

  const textarea = page.locator("#notice-text");
  await expect(textarea).toHaveValue(/Prova de Ciências em 02\/10\/2026/);
  // A data de cada mensagem acompanha o texto: "amanhã" de terça não é hoje.
  await expect(textarea).toHaveValue(/Mensagem de 27\/09\/2026/);
  await expect(textarea).not.toHaveValue(/Obrigada, professora/);
  // A mais recente entre as escolhidas vira a publicação do recado.
  await expect(page.locator("#notice-published")).toHaveValue("2026-09-27");
  await expect(page.locator("#notice-source")).toHaveValue("whatsapp");

  // Compartilhar sem o service worker no comando: a rota de segurança leva
  // para a importação com o texto colado, em vez do erro do navegador.
  const shared = await page.request.post(`${baseURL}/recados/compartilhar`, {
    headers: { Origin: baseURL },
    multipart: { title: "Recado da escola", text: "Prova de Ciências em 02/10/2026." },
    maxRedirects: 0,
  });
  expect(shared.status()).toBe(303);
  const location = shared.headers().location ?? "";
  expect(location).toContain("/recados/novo");
  // `URLSearchParams` codifica espaço como "+", então a leitura é pelo parâmetro.
  expect(new URL(location, baseURL).searchParams.get("texto")).toContain(
    "Prova de Ciências em 02/10/2026.",
  );
});

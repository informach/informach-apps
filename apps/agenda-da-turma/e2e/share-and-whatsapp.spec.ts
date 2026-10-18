import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { db, eq } from "@informach/db";
import {
  accounts,
  agendaProductEvents,
  agendaStudentProfiles,
  emailDeliveries,
  users,
} from "@informach/db/schema";
import { expect, test } from "@playwright/test";

const CONVERSA = `26/09/2026 07:12 - Coordenação: Bom dia a todos!
27/09/2026 18:43 - Profa. Marina: Prova de Ciências em 02/10/2026.
Estudar capítulos 4 e 5.
27/09/2026 18:44 - Mãe da Bia: Obrigada, professora!`;

test("bringing a recado in without copying: WhatsApp export and the share fallback", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `share-whatsapp-${randomUUID()}`;
  const email = `${id}@e2e.local`;
  try {
    const authRequire = createRequire(
      path.resolve(process.cwd(), "../../packages/auth/package.json"),
    );
    const { hashPassword } = await import(
      pathToFileURL(authRequire.resolve("better-auth/crypto")).href
    );
    await db.insert(users).values({ id, name: "Responsável fictício", email, emailVerified: true });
    await db.insert(accounts).values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword("ShareWhats!Synthetic2026"),
    });
    const login = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { Origin: baseURL },
      data: { email, password: "ShareWhats!Synthetic2026" },
    });
    expect(login.ok()).toBe(true);
    // O grátis vale por padrão: depois do login, a conta vai direto para Hoje.
    await page.goto("/dashboard");
    await db.insert(agendaStudentProfiles).values({ userId: id, name: "Criança navegador" });

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
    const shared = await context.request.post(`${baseURL}/recados/compartilhar`, {
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
  } finally {
    await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, id));
    await db.delete(emailDeliveries).where(eq(emailDeliveries.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
});

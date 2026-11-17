import { createHmac } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, test } from "@playwright/test";
import postgres from "postgres";
import { comecarVigia, fecharAparelhos, hidratado, novaPessoa, SENHA, tela, vigia } from "./apoio";

test.skip(process.env.RECREIO_E2E_EQUIPE !== "1", "Jornada dedicada com dois servidores isolados");
test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
  expect(vigia().errosDeConsole).toEqual([]);
});

/** Cliente autenticador RFC 6238; a chave vem da tela real, nunca do banco. */
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Chave de autenticador inválida");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, i) =>
      Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2),
    ),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest.readUInt8(digest.length - 1) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
async function codigoDeAtivacao(email: string) {
  const dir = process.env.EMAIL_SANDBOX_DIR;
  if (!dir) throw new Error("Caixa sintética ausente");
  let code = "";
  await expect
    .poll(async () => {
      for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
        const message = JSON.parse(await readFile(path.join(dir, file), "utf8"));
        if (message.to === email && message.category === "auth.two-factor-setup-otp")
          code = message.text?.match(/\b\d{6}\b/)?.[0] ?? "";
      }
      return code.length;
    })
    .toBe(6);
  return code;
}
async function aplicar(caso: Locator, operacao: string) {
  const select = caso.getByRole("combobox", { name: "Ação nesta revisão", exact: true });
  await hidratado(select);
  await select.selectOption(operacao);
  const botao = caso.getByRole("button", { name: "Confirmar ação da equipe", exact: true });
  await expect(botao).toBeDisabled();
  await caso.getByRole("checkbox", { name: /Conferi o protocolo/ }).check();
  await botao.click();
  await expect(caso.getByRole("status")).toContainText("Comando confirmado pelo Recreio");
  await expect(botao).toBeDisabled();
}

test("equipe ativa autenticador, entra com duas etapas e suspende um perfil com recibo real", async ({
  browser,
}) => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
  )
    throw new Error("Jornada da equipe exige banco descartável");
  const db = postgres(url.toString(), { max: 1 });
  const contexto = await browser.newContext({ baseURL: process.env.RECREIO_E2E_ADMIN_ORIGIN });
  const erros: string[] = [];
  contexto.on("page", (page) => page.on("pageerror", (erro) => erros.push(erro.message)));
  try {
    const a = await novaPessoa(browser, "Origem reservada", { comAcesso: false });
    const b = await novaPessoa(browser, "Alvo reservado", { comAcesso: false });
    await b.page.goto("/conta");
    const destino = await b.page
      .getByRole("link", { name: "Conferir acesso de Alvo reservado", exact: true })
      .getAttribute("href");
    if (!destino) throw new Error("Destino de revisão ausente");
    await b.page.goto("/amigos");
    const gerar = b.page.getByRole("button", { name: "Gerar código", exact: true });
    await hidratado(gerar);
    await gerar.click();
    const code = await b.page.getByLabel("Código de amizade", { exact: true }).innerText();
    await a.page.goto("/amigos");
    const campo = a.page.getByLabel("Código que você recebeu", { exact: true });
    await hidratado(campo);
    await campo.fill(code);
    await a.page.getByRole("button", { name: "Enviar pedido", exact: true }).click();
    const denunciar = a.page.getByRole("button", { name: "Denunciar contato", exact: true });
    await hidratado(denunciar);
    await denunciar.click();
    await a.page.getByLabel("O que aconteceu?", { exact: true }).selectOption("outro");
    await a.page.getByRole("button", { name: "Enviar denúncia", exact: true }).click();
    const output = a.page.getByLabel("Protocolo da denúncia", { exact: true });
    await expect(output).toBeVisible();
    const protocolo = (await output.innerText()).trim();

    // Só o papel inicial é fixture. Senha, confirmação de e-mail, chave,
    // ativação, novo desafio e cookies passam pelas interfaces verdadeiras.
    const staff = await novaPessoa(browser, "Equipe do ensaio", { semPerfil: true });
    const rows =
      await db`update core.users set role='admin' where email=${staff.email} returning id`;
    expect(rows).toHaveLength(1);
    const staffRow = rows[0];
    if (!staffRow) throw new Error("Conta sintética da equipe não foi preparada");
    const page = await contexto.newPage();
    await page.goto("/entrar");
    const email = page.getByLabel("E-mail", { exact: true });
    await hidratado(email);
    await email.fill(staff.email);
    await page.getByLabel("Senha", { exact: true }).fill(SENHA);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page).toHaveURL(/\/duas-etapas$/);
    await page.goto(`/recreio/seguranca?protocolo=${protocolo}`);
    await expect(page).toHaveURL(/\/duas-etapas$/);
    const enviar = page.getByRole("button", { name: "Enviar código para o e-mail", exact: true });
    await hidratado(enviar);
    await enviar.click();
    await page
      .getByLabel("Código do e-mail", { exact: true })
      .fill(await codigoDeAtivacao(staff.email));
    await page.getByRole("button", { name: "Confirmar código", exact: true }).click();
    await page.getByLabel("Senha", { exact: true }).fill(SENHA);
    await page.getByRole("button", { name: "Gerar chave", exact: true }).click();
    const chave = (await page.locator("code").innerText()).trim();
    await page.getByRole("checkbox", { name: "Guardei os códigos", exact: true }).check();
    await page.getByLabel("Código de 6 números", { exact: true }).fill(totp(chave));
    await page.getByRole("button", { name: "Ativar e entrar", exact: true }).click();
    await expect(page).toHaveURL(/:\d+\/$/);
    // Sai pelo endpoint real; conserva a chave só na RAM do cliente autenticador.
    const sair = await page.request.post("/api/auth/sign-out", {
      headers: { Origin: process.env.RECREIO_E2E_ADMIN_ORIGIN ?? "" },
      data: {},
    });
    expect(sair.ok()).toBe(true);
    await page.goto(
      `/entrar?next=${encodeURIComponent(`/recreio/seguranca?protocolo=${protocolo}`)}`,
    );
    const login = page.getByLabel("E-mail", { exact: true });
    await hidratado(login);
    await login.fill(staff.email);
    await page.getByLabel("Senha", { exact: true }).fill(SENHA);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Digite o código do autenticador" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Segurança do Recreio", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Código de 6 números", { exact: true }).fill(totp(chave));
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("link", { name: "Confirmar abertura da fila", exact: true }).click();
    const caso = page.getByRole("article").filter({ hasText: protocolo });
    await expect(caso).toHaveCount(1);
    await expect(page.getByText("Origem reservada", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Alvo reservado", { exact: true })).toHaveCount(0);
    await aplicar(caso, "suspender_perfil");
    await b.page.goto(destino);
    await expect(
      b.page.getByRole("heading", { name: "Acesso suspenso", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Atualizar este caso antes de continuar", exact: true })
      .click();
    await aplicar(caso, "analisar");
    await page
      .getByRole("link", { name: "Atualizar este caso antes de continuar", exact: true })
      .click();
    await caso
      .getByRole("combobox", { name: "Ação nesta revisão", exact: true })
      .selectOption("concluir");
    await caso
      .getByRole("combobox", { name: "Decisão", exact: true })
      .selectOption("medida_aplicada");
    await aplicar(caso, "concluir");
    await a.page.goto(`/denuncias?protocolo=${protocolo}`);
    await expect(
      a.page.getByRole("heading", { name: "Resposta da equipe", exact: true }),
    ).toBeVisible();
    await expect(a.page.getByText(/A equipe registrou uma medida/)).toBeVisible();
    const audit = await db`select event_type,count(*)::int as total from audit.events
      where actor_id=${staffRow.id} and payload->>'caseId'=${protocolo} group by event_type`;
    expect(audit).toEqual(
      expect.arrayContaining([
        { event_type: "admin.recreio_moderation_requested", total: 3 },
        { event_type: "recreio.moderation_command_applied", total: 3 },
      ]),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await tela(page, "equipe-seguranca-mobile", { paginaInteira: true });
    expect(erros).toEqual([]);
  } finally {
    await contexto.close();
    await db.end();
  }
});

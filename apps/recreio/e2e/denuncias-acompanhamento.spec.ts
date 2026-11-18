import { randomUUID } from "node:crypto";
import { emitirProvaDeModeracao } from "@informach/recreio/emissor";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { comecarVigia, fecharAparelhos, hidratado, novaPessoa, tela, vigia } from "./apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
  expect(vigia().errosDeConsole).toEqual([]);
});

/** Sessão sintética já autenticada para exercitar o protocolo HTTP, não o desafio TOTP. */
async function equipeDaExecucao() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
  )
    throw new Error("Equipe sintética só no banco descartável");
  const db = postgres(url.toString(), { max: 1 }),
    contaId = randomUUID(),
    authSessionId = randomUUID();
  try {
    await db`insert into core.users(id,name,email,email_verified,role,two_factor_enabled)
      values(${contaId},'Equipe sintética',${`${contaId}@example.test`},true,'admin',true)`;
    await db`insert into core.sessions(id,user_id,token,expires_at)
      values(${authSessionId},${contaId},${randomUUID()},clock_timestamp()+interval '12 hours')`;
    return { contaId, authSessionId };
  } finally {
    await db.end();
  }
}

test("denúncia recebe resposta pela API restrita e revisão pela própria pessoa sem revelar o alvo", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Origem do pedido", { comAcesso: false });
  const b = await novaPessoa(browser, "Contato reservado", { comAcesso: false });
  await b.page.goto("/amigos");
  const gerar = b.page.getByRole("button", { name: "Gerar código", exact: true });
  await hidratado(gerar);
  await gerar.click();
  const codigo = await b.page.getByLabel("Código de amizade", { exact: true }).innerText();
  await a.page.goto("/amigos");
  const recebido = a.page.getByLabel("Código que você recebeu", { exact: true });
  await hidratado(recebido);
  await recebido.fill(codigo);
  await a.page.getByRole("button", { name: "Enviar pedido", exact: true }).click();
  const denunciar = a.page.getByRole("button", { name: "Denunciar contato", exact: true });
  await hidratado(denunciar);
  await denunciar.click();
  await a.page.getByLabel("O que aconteceu?", { exact: true }).selectOption("outro");
  await a.page.getByRole("button", { name: "Enviar denúncia", exact: true }).click();
  const output = a.page.getByLabel("Protocolo da denúncia", { exact: true });
  await expect(output).toBeVisible();
  const protocolo = (await output.innerText()).trim();
  await a.page.getByRole("link", { name: "Acompanhar denúncia", exact: true }).click();
  await expect(
    a.page.getByRole("heading", { name: "Recebida pela equipe", exact: true }),
  ).toBeVisible();
  await expect(a.page.getByText("Contato reservado", { exact: true })).toHaveCount(0);
  const staff = await equipeDaExecucao(),
    segredo = process.env.RECREIO_MODERATION_SECRET;
  if (!segredo) throw new Error("Credencial sintética ausente");
  for (const comando of [
    { comandoId: randomUUID(), protocolo, versaoDoCaso: 1, operacao: "analisar" },
    {
      comandoId: randomUUID(),
      protocolo,
      versaoDoCaso: 2,
      operacao: "concluir",
      decisao: "sem_elementos",
    },
  ]) {
    const prova = await emitirProvaDeModeracao(segredo, { ...staff, comando, agora: new Date() });
    const resposta = await a.page.request.post("/api/moderacao/v1/comandos", {
      headers: { Authorization: `Bearer ${prova}` },
      data: comando,
    });
    expect(resposta.status()).toBe(200);
  }
  await a.page.reload();
  await expect(
    a.page.getByRole("heading", { name: "Resposta da equipe", exact: true }),
  ).toBeVisible();
  const revisar = a.page.getByRole("button", { name: "Pedir revisão da resposta", exact: true });
  await hidratado(revisar);
  await revisar.click();
  await expect(
    a.page.getByText("Pedido de revisão recebido. O protocolo continua o mesmo.", { exact: true }),
  ).toBeVisible();
  await a.page.reload();
  await expect(
    a.page.getByRole("heading", { name: "Revisão recebida", exact: true }),
  ).toBeVisible();
  await expect(
    a.page.getByRole("button", { name: "Pedir revisão da resposta", exact: true }),
  ).toHaveCount(0);
  await a.page.setViewportSize({ width: 390, height: 844 });
  expect(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await tela(a.page, "denuncia-acompanhamento-mobile", { paginaInteira: true });
  await b.page.goto(`/denuncias?protocolo=${protocolo}`);
  await expect(
    b.page.getByText("Nenhuma denúncia disponível nesta consulta para este perfil.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(b.page.getByRole("heading", { name: "Revisão recebida", exact: true })).toHaveCount(
    0,
  );
});

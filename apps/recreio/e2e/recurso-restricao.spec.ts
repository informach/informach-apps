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

/** Fixture de dado legado no banco descartável, sem endpoint ou desvio de autoridade no app. */
async function suspensaoLegada(perfilId: string) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname) ||
    !/^[a-f0-9-]{36}$/.test(perfilId)
  )
    throw new Error("Fixture restrita ao banco descartável do ensaio");
  const db = postgres(url.toString(), { max: 1 });
  try {
    const alterados =
      await db`update recreio.profiles set status='suspended', policy_version=policy_version+1,
      updated_at=clock_timestamp() where id=${perfilId} returning id`;
    expect(alterados).toHaveLength(1);
  } finally {
    await db.end();
  }
}

test("titular sem plano pede revisão, recebe protocolo e recupera a situação após recarregar", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "Sol em revisão", { comAcesso: false });
  await pessoa.page.goto("/conta");
  const acesso = pessoa.page.getByRole("link", {
    name: "Conferir acesso de Sol em revisão",
    exact: true,
  });
  const destino = await acesso.getAttribute("href");
  const id = destino?.match(/^\/conta\/perfis\/([a-f0-9-]{36})\/restricao$/)?.[1];
  if (!id || !destino) throw new Error("Destino do próprio perfil ausente");
  await suspensaoLegada(id);
  await pessoa.page.goto(destino);
  await expect(
    pessoa.page.getByRole("heading", { name: "Acesso suspenso", exact: true }),
  ).toBeVisible();
  const pedir = pessoa.page.getByRole("button", { name: "Solicitar revisão", exact: true });
  await hidratado(pedir);
  await pedir.click();
  await expect(
    pessoa.page.getByRole("heading", { name: "Aguardando análise da equipe", exact: true }),
  ).toBeVisible();
  await pessoa.page.reload();
  await expect(
    pessoa.page.getByRole("button", { name: "Solicitar revisão", exact: true }),
  ).toHaveCount(0);
  await expect(
    pessoa.page.getByRole("heading", { name: "Aguardando análise da equipe", exact: true }),
  ).toHaveCount(1);
  await pessoa.page.setViewportSize({ width: 390, height: 844 });
  expect(await pessoa.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await tela(pessoa.page, "recurso-titular-mobile", { paginaInteira: true });
});

test("responsável sem jogador consulta e contesta o acesso do menor", async ({ browser }) => {
  const pessoa = await novaPessoa(browser, "Responsável pela revisão", { semPerfil: true });
  await pessoa.page.goto("/conta/perfis");
  const adicionar = pessoa.page.getByRole("button", { name: "Adicionar perfil", exact: true });
  await hidratado(adicionar);
  await adicionar.click();
  const apelido = pessoa.page.getByLabel("Apelido", { exact: true });
  await hidratado(apelido);
  await apelido.fill("Lua em revisão");
  await pessoa.page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
  await pessoa.page
    .getByLabel("Ano de nascimento", { exact: true })
    .fill(String(new Date().getUTCFullYear() - 8));
  await pessoa.page.getByRole("checkbox", { name: /Declaro que tenho 18/ }).check();
  await pessoa.page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
  const link = pessoa.page.getByRole("link", {
    name: "Acesso e revisão de Lua em revisão",
    exact: true,
  });
  await expect(link).toBeVisible();
  const destino = await link.getAttribute("href");
  const id = destino?.match(/^\/conta\/perfis\/([a-f0-9-]{36})\/restricao$/)?.[1];
  if (!id || !destino) throw new Error("Destino do perfil sob responsabilidade ausente");
  await suspensaoLegada(id);
  await pessoa.page.goto(destino);
  const pedir = pessoa.page.getByRole("button", { name: "Solicitar revisão", exact: true });
  await hidratado(pedir);
  await pedir.click();
  await expect(
    pessoa.page.getByRole("heading", { name: "Aguardando análise da equipe", exact: true }),
  ).toBeVisible();
  await pessoa.page.reload();
  await expect(
    pessoa.page.getByRole("heading", { name: "Acesso de Lua em revisão", exact: true }),
  ).toBeVisible();
  await expect(
    pessoa.page.getByRole("button", { name: "Solicitar revisão", exact: true }),
  ).toHaveCount(0);
  await pessoa.page.setViewportSize({ width: 390, height: 844 });
  expect(await pessoa.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await tela(pessoa.page, "recurso-responsavel-mobile", { paginaInteira: true });
});

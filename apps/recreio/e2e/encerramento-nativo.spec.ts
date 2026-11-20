import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { hidratado, novaPessoa, tela } from "./apoio";

function banco() {
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (
    !url ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname) ||
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    process.env.RECREIO_E2E_ACCOUNT_CLOSURE !== "1" ||
    process.env.GITHUB_ACTIONS !== "true"
  )
    throw new Error("Native closure requires disposable GitHub PostgreSQL");
  return postgres(url.toString(), { max: 1 });
}
function processar() {
  const r = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/processar-direitos.ts"],
    { cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 90000, windowsHide: true },
  );
  if (r.error || r.status !== 0)
    throw new Error("Native rights executor did not confirm this synthetic round");
}
async function previa(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/conta/dados");
  const escolher = page.getByRole("radio", {
    name: "Encerrar minha participação no Recreio",
    exact: true,
  });
  await hidratado(escolher);
  await escolher.check();
  await page.getByRole("checkbox", { name: /Conferi a seleção e quero preparar/ }).check();
  await page.getByRole("button", { name: "Preparar prévia", exact: true }).click();
  const regiao = page.getByRole("region", { name: "Sua prévia", exact: true });
  await expect(
    regiao.getByRole("heading", { name: "Confirmar encerramento no Recreio", exact: true }),
  ).toBeVisible();
  return regiao;
}
async function copiarDepoisDeEncerrar(page: Page, email: string) {
  await page.goto("/conta/dados");
  const regiao = page.getByRole("region", { name: "Uma cópia dos seus dados", exact: true });
  const preparar = regiao.getByRole("button", { name: "Preparar cópia", exact: true });
  await hidratado(preparar);
  await regiao.getByLabel("Dados da cópia", { exact: true }).selectOption("account");
  await preparar.click();
  await expect(regiao.getByText("Cópia preparada", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await regiao.getByRole("button", { name: "Baixar cópia da conta", exact: true }).click();
  const path = await (await download).path();
  if (!path) throw new Error("Personal export absent");
  const texto = await readFile(path, "utf8");
  expect(texto).toContain(email);
  expect(texto).toContain('"estado":"closed"');
}

test("consentimento real encerra conta com e sem jogador, mantendo outra conta e os direitos", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Perfil de saída", { comAcesso: false });
  const b = await novaPessoa(browser, "Perfil preservado", { comAcesso: false });
  const c = await novaPessoa(browser, "Sem jogador", { semPerfil: true });
  const client = banco();
  try {
    const [preservado] =
      await client`select p.* from recreio.profiles p join core.users u on u.id=p.user_id where u.email=${b.email}`;
    expect(preservado).toBeDefined();
    const regiao = await previa(a.page),
      caixas = regiao.getByRole("checkbox");
    await expect(caixas).toHaveCount(3);
    for (let n = 0; n < 3; n++) await expect(caixas.nth(n)).not.toBeChecked();
    const confirmar = regiao.getByRole("button", {
      name: "Confirmar encerramento no Recreio",
      exact: true,
    });
    await expect(confirmar).toBeDisabled();
    await caixas.nth(0).check();
    await caixas.nth(1).check();
    await expect(confirmar).toBeDisabled();
    await tela(a.page, "encerramento-aceites-390", { paginaInteira: true });
    await caixas.nth(2).check();
    await expect(confirmar).toBeEnabled();
    let liberar: (() => void) | undefined,
      interceptada = false;
    const aguardar = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    await a.page.route("**/conta/dados", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
        interceptada = true;
        await aguardar;
      }
      await route.continue();
    });
    try {
      await confirmar.click();
      await expect.poll(() => interceptada).toBe(true);
      await expect(
        regiao.getByRole("button", { name: "Cancelar esta prévia", exact: true }),
      ).toBeDisabled();
      await expect(
        regiao.getByRole("button", { name: "Preparar outra prévia", exact: true }),
      ).toBeDisabled();
    } finally {
      liberar?.();
    }
    await expect(
      a.page.getByText(
        "Pedido de encerramento confirmado. Acompanhe as etapas nos pedidos recentes abaixo.",
        { exact: true },
      ),
    ).toBeVisible();
    await a.page.unroute("**/conta/dados");
    expect(
      await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await tela(a.page, "encerramento-processando-390", { paginaInteira: true });
    processar();
    await a.page.goto("/conta");
    await expect(
      a.page.getByRole("heading", { name: "Participação encerrada", exact: true }),
    ).toBeVisible();
    await tela(a.page, "encerramento-concluido-390", { paginaInteira: true });
    await copiarDepoisDeEncerrar(a.page, a.email);
    const semPerfil = await previa(c.page);
    await expect(semPerfil.getByText("Perfis selecionados", { exact: true })).toBeVisible();
    await tela(c.page, "encerramento-sem-jogador-390", { paginaInteira: true });
    for (const caixa of await semPerfil.getByRole("checkbox").all()) await caixa.check();
    await semPerfil
      .getByRole("button", { name: "Confirmar encerramento no Recreio", exact: true })
      .click();
    await expect(
      c.page.getByText(
        "Pedido de encerramento confirmado. Acompanhe as etapas nos pedidos recentes abaixo.",
        { exact: true },
      ),
    ).toBeVisible();
    processar();
    await c.page.goto("/conta");
    await expect(
      c.page.getByRole("heading", { name: "Participação encerrada", exact: true }),
    ).toBeVisible();
    for (const email of [a.email, c.email]) {
      const [row] =
        await client`select p.state,p.revision,o.state as operation_state,f.state as financial_state
        from core.users u join recreio.account_participations p on p.user_id=u.id
        join recreio.rights_operations o on o.id=p.operation_id join recreio.account_closure_finances f on f.operation_id=o.id
        where u.email=${email} and o.ledger_id=${process.env.RECREIO_RIGHTS_LEDGER_ID}::uuid`;
      expect(row).toMatchObject({
        state: "closed",
        revision: 3,
        operation_state: "completed",
        financial_state: "confirmed",
      });
      expect(
        await client`select p.id from recreio.profiles p join core.users u on u.id=p.user_id where u.email=${email}`,
      ).toHaveLength(0);
    }
    const [depois] =
      await client`select p.* from recreio.profiles p join core.users u on u.id=p.user_id where u.email=${b.email}`;
    expect(depois).toEqual(preservado);
    await b.page.goto("/conta/dados");
    await expect(
      b.page.getByRole("button", { name: "Preparar prévia", exact: true }),
    ).toBeVisible();
    if (!process.env.RUNNER_TEMP || !process.env.GITHUB_RUN_ID || !process.env.GITHUB_RUN_ATTEMPT)
      throw new Error("GitHub receipt location absent");
    await writeFile(
      resolve(
        process.env.RUNNER_TEMP,
        `recreio-encerramento-ui-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}.json`,
      ),
      `${JSON.stringify({
        formato: "recreio-encerramento-ui-v1",
        source: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID,
        livroId: process.env.RECREIO_RIGHTS_LEDGER_ID,
        semJogador: true,
        perfilProprio: true,
        outraContaPreservada: true,
        copiaAposEncerramento: true,
        aceitesExplicitos: true,
        envioBloqueiaOutraPrevia: true,
        executorNativo: true,
      })}\n`,
      { flag: "wx", mode: 0o600 },
    );
  } finally {
    await client.end();
    await a.contexto.close();
    await b.contexto.close();
    await c.contexto.close();
  }
});

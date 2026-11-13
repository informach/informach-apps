import { type ChildProcess, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  expect,
  type Locator,
  type Page,
  type Response,
  test,
} from "@playwright/test";

/**
 * Apoio dos testes de ponta a ponta do portal: o que os arquivos de `e2e/`
 * têm em comum. Navegadores com a política de segurança vigiada, os passos do
 * portal (conta, código do e-mail, perfil, concessão, mundo, convite) e o
 * cuidado com um processo filho que faz o papel do servidor de um jogo.
 *
 * Só roda por `pnpm e2e` (`scripts/isolated.mjs e2e`), que cria o banco
 * descartável, gera os segredos da execução e faz o build de produção.
 */

export const SENHA = "Recreio-Teste-2026-Local!";
export const APP = process.cwd();
/** Capturas das telas do jogo, para quem revisa olhar (`tmp` não entra no git). */
const TELAS = process.env.RECREIO_E2E_PRIVATE_ARTIFACTS
  ? path.resolve(process.env.RECREIO_E2E_PRIVATE_ARTIFACTS, "telas")
  : path.resolve(APP, "tmp/telas");

export async function tela(page: Page, nome: string): Promise<void> {
  await mkdir(TELAS, { recursive: true });
  await page.screenshot({ path: path.join(TELAS, `${nome}.png`), animations: "disabled" });
}

/** O endereço do servidor de um jogo, como o ambiente da execução o cadastrou no Recreio. */
export function origemDoJogo(jogo: string): { ws: string; http: string; porta: number } {
  const origens: unknown = JSON.parse(process.env.RECREIO_GAME_ORIGINS ?? "{}");
  const ws =
    typeof origens === "object" && origens !== null && jogo in origens
      ? (origens as Record<string, { ws?: unknown }>)[jogo]?.ws
      : undefined;
  if (typeof ws !== "string") throw new Error(`RECREIO_GAME_ORIGINS sem o jogo ${jogo}`);
  return { ws, http: ws.replace(/^ws/, "http"), porta: Number(new URL(ws).port) };
}

/** O segredo de um jogo na API das instâncias, como o portal desta execução o conhece. */
export function segredoDoJogo(jogo: string): string {
  const segredos: unknown = JSON.parse(process.env.RECREIO_HOST_SECRETS ?? "{}");
  const segredo =
    typeof segredos === "object" && segredos !== null
      ? (segredos as Record<string, unknown>)[jogo]
      : undefined;
  if (typeof segredo !== "string") throw new Error(`RECREIO_HOST_SECRETS sem o jogo ${jogo}`);
  return segredo;
}

// --- Processos filhos ---

export function saiu(filho: ChildProcess): Promise<void> {
  if (filho.exitCode !== null || filho.signalCode !== null) return Promise.resolve();
  return new Promise((resolver) => filho.once("exit", () => resolver()));
}

/** Espera o processo sair por conta própria; passado o prazo, derruba. Devolve se saiu sozinho. */
export async function esperarSaida(filho: ChildProcess, prazoMs: number): Promise<boolean> {
  const fim = saiu(filho);
  const noPrazo = await Promise.race([
    fim.then(() => true),
    new Promise<boolean>((resolver) => setTimeout(() => resolver(false), prazoMs)),
  ]);
  if (!noPrazo) {
    filho.kill("SIGKILL");
    await fim;
  }
  return noPrazo;
}

/** As linhas de JSON que um processo escreveu, uma por acontecimento. */
export function linhasDeJson(saida: readonly string[]): Record<string, unknown>[] {
  return saida
    .join("")
    .split(/\r?\n/)
    .flatMap((linha) => {
      try {
        const lido: unknown = JSON.parse(linha);
        return typeof lido === "object" && lido !== null ? [lido as Record<string, unknown>] : [];
      } catch {
        return [];
      }
    });
}

// --- Navegadores, com a política de segurança vigiada ---

const contextos: BrowserContext[] = [];
let violacoes: string[] = [];
let errosDePagina: string[] = [];
let errosDeConsole: string[] = [];
/** Erros de console que o teste espera agora (rede caindo de propósito, por exemplo). */
let esperado: ((mensagem: ConsoleMessage) => boolean) | null = null;

/**
 * O navegador escreve no console, como erro, toda resposta sem sucesso de um
 * pedido. Na API do SDK, recusar é parte do contrato (`JA_ABERTO` é 409,
 * `SEM_INSTANCIA` é 503, sessão encerrada é 401 ou 403), e cada teste confere
 * a tela que a recusa produz. Essas linhas do navegador não são erro do
 * portal nem do jogo; qualquer outro erro de console é.
 */
function ehRecusaDoSdk(mensagem: ConsoleMessage): boolean {
  return (
    /^Failed to load resource: the server responded with a status of (401|403|409|503)\b/.test(
      mensagem.text(),
    ) && new URL(mensagem.location().url, "http://x").pathname.startsWith("/api/sdk/v1/")
  );
}

/** Vigia um contexto: violação da política de segurança, erro de página e erro de console ficam anotados. */
export async function vigiar(contexto: BrowserContext): Promise<void> {
  await contexto.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (evento) => {
      console.error(`CSP-VIOLACAO ${evento.violatedDirective} ${evento.blockedURI}`);
    });
  });
  contexto.on("console", (mensagem) => {
    const texto = mensagem.text();
    const onde = mensagem.page()?.url() ?? "?";
    if (/CSP-VIOLACAO|Content Security Policy|Content-Security-Policy/i.test(texto))
      violacoes.push(`${onde}: ${texto}`);
    else if (mensagem.type() === "error" && !ehRecusaDoSdk(mensagem) && !esperado?.(mensagem))
      errosDeConsole.push(`${onde}: ${texto} (${mensagem.location().url})`);
  });
  contexto.on("weberror", (erro) => errosDePagina.push(erro.error().message));
}

/** Um aparelho novo, vigiado. O endereço de rede é só dele: o limite de cadastros é por endereço. */
export async function novoAparelho(browser: Browser): Promise<BrowserContext> {
  const uso = test.info().project.use;
  const semente = createHash("sha256").update(randomUUID()).digest();
  const contexto = await browser.newContext({
    baseURL: uso.baseURL,
    viewport: uso.viewport,
  });
  if (!uso.baseURL) throw new Error("E2E sem origem do portal");
  // O IP fictício só vai ao portal. Cabeçalho global vazava para a origem
  // da arte e tornava seu preflight diferente do navegador de produção.
  await contexto.route(`${new URL(uso.baseURL).origin}/**`, (rota) =>
    rota.continue({
      headers: { ...rota.request().headers(), "x-real-ip": `198.51.${semente[0]}.${semente[1]}` },
    }),
  );
  await vigiar(contexto);
  contextos.push(contexto);
  return contexto;
}

/** Tira um contexto da lista dos que o fim do teste fecha: o teste já cuidou dele. */
export function esquecerAparelho(contexto: BrowserContext): void {
  const indice = contextos.indexOf(contexto);
  if (indice >= 0) contextos.splice(indice, 1);
}

/** Zera as anotações. Chamado antes de cada teste. */
export function comecarVigia(): void {
  violacoes = [];
  errosDePagina = [];
  errosDeConsole = [];
  esperado = null;
}

/**
 * Enquanto `durante` roda, erros de console que casam com `ehEsperado` não
 * contam. Serve para o trecho em que o teste derruba um servidor de propósito:
 * o navegador registra cada conexão recusada.
 */
export async function tolerando<T>(
  ehEsperado: (mensagem: ConsoleMessage) => boolean,
  durante: () => Promise<T>,
): Promise<T> {
  const anterior = esperado;
  esperado = ehEsperado;
  try {
    return await durante();
  } finally {
    esperado = anterior;
  }
}

/** Fecha os aparelhos do teste. Chamado no fim de cada teste, antes de conferir a vigia. */
export async function fecharAparelhos(): Promise<void> {
  for (const contexto of contextos.splice(0)) await contexto.close().catch(() => undefined);
}

/** O que a vigia anotou neste teste. */
export function vigia(): {
  violacoes: string[];
  errosDePagina: string[];
  errosDeConsole: string[];
} {
  return { violacoes, errosDePagina, errosDeConsole };
}

// --- Passos do portal ---

/** Espera o React assumir o elemento: antes disso um clique não faz nada. */
export async function hidratado(alvo: Locator): Promise<void> {
  await expect
    .poll(() =>
      alvo.evaluate((elemento) =>
        Object.keys(elemento).some((chave) => chave.startsWith("__reactProps$")),
      ),
    )
    .toBe(true);
}

async function codigoDoEmail(email: string): Promise<string> {
  const pasta = process.env.EMAIL_SANDBOX_DIR;
  if (!pasta) throw new Error("EMAIL_SANDBOX_DIR ausente");
  let codigo = "";
  await expect
    .poll(
      async () => {
        const arquivos = (await readdir(pasta).catch(() => [] as string[])).filter((arquivo) =>
          arquivo.endsWith(".json"),
        );
        for (const arquivo of arquivos) {
          const mensagem = JSON.parse(await readFile(path.join(pasta, arquivo), "utf8"));
          if (mensagem.to === email && mensagem.category === "auth.verify-email-otp")
            codigo = mensagem.text?.match(/\b\d{6}\b/)?.[0] ?? "";
        }
        return codigo.length;
      },
      { timeout: 15_000 },
    )
    .toBe(6);
  return codigo;
}

/** Libera os jogos para a conta com o script da equipe, no mesmo banco do portal. */
export function conceder(email: string): void {
  const execucao = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/conceder.ts",
      "--email",
      email,
      "--tier",
      "individual",
      "--dias",
      "30",
      "--motivo",
      "e2e",
    ],
    { cwd: APP, env: process.env, encoding: "utf8", windowsHide: true },
  );
  if (execucao.status !== 0)
    throw new Error(`conceder falhou (${execucao.status}): ${execucao.stderr}`);
}

export type Pessoa = { contexto: BrowserContext; page: Page; email: string; apelido: string };

/** Uma conta nova num aparelho novo: cadastro, código do e-mail e perfil. */
export async function novaPessoa(
  browser: Browser,
  apelido: string,
  opcoes: { comAcesso?: boolean } = {},
): Promise<Pessoa> {
  const contexto = await novoAparelho(browser);
  const page = await contexto.newPage();
  const email = `recreio-${randomUUID()}@example.test`;
  await page.goto("/entrar");
  const criarConta = page.getByRole("button", { name: "Criar conta", exact: true });
  await hidratado(criarConta);
  await criarConta.click();
  await page.getByLabel("Como podemos chamar você?").fill(`Conta de ${apelido}`);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("checkbox").check();
  await page.locator('form button[type="submit"]').click();
  await page.getByLabel("Código de seis dígitos").fill(await codigoDoEmail(email));
  await page.getByRole("button", { name: "Confirmar e-mail", exact: true }).click();
  await expect(page).toHaveURL(/\/comecar$/);
  const campoDoApelido = page.getByLabel("Apelido");
  await hidratado(campoDoApelido);
  await campoDoApelido.fill(apelido);
  await page.getByRole("button", { name: "Criar perfil" }).click();
  await expect(page).toHaveURL(/\/estante$/);
  if (opcoes.comAcesso !== false) conceder(email);
  return { contexto, page, email, apelido };
}

/**
 * A mesma conta entra de novo, em outro aparelho: senha, "Quem vai jogar?" e
 * a estante. É o que acontece com quem perdeu o navegador e voltou.
 */
export async function entrarDeNovo(browser: Browser, pessoa: Pessoa): Promise<Pessoa> {
  const contexto = await novoAparelho(browser);
  const page = await contexto.newPage();
  await page.goto("/entrar");
  const email = page.getByLabel("E-mail", { exact: true });
  await hidratado(email);
  await email.fill(pessoa.email);
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar no Recreio", exact: true }).click();
  await expect(page).toHaveURL(/\/perfis$/);
  const perfil = page.getByRole("button", { name: new RegExp(pessoa.apelido) });
  await hidratado(perfil);
  await perfil.click();
  await expect(page).toHaveURL(/\/estante$/);
  return { ...pessoa, contexto, page };
}

/** Cria um mundo pela estante, na seção do jogo, e devolve o id dele. */
export async function criarMundo(page: Page, nomeDoJogo: string, nome: string): Promise<string> {
  await page.goto("/estante");
  const secao = page.getByRole("region", { name: `Seus mundos no ${nomeDoJogo}` });
  const campo = secao.getByLabel("Nome do mundo");
  await hidratado(campo);
  await campo.fill(nome);
  await secao.getByRole("button", { name: "Criar mundo" }).click();
  await expect(page).toHaveURL(/\/mundos\/[0-9a-f-]{36}$/);
  const id = new URL(page.url()).pathname.split("/").pop();
  if (!id) throw new Error("Mundo sem id no endereço");
  return id;
}

/** O responsável gera o código na página do mundo; a outra pessoa entra com ele pela estante. */
export async function convidar(dono: Page, convidada: Page, mundoId: string): Promise<void> {
  if (!new URL(dono.url()).pathname.endsWith(`/mundos/${mundoId}`))
    await dono.goto(`/mundos/${mundoId}`);
  const gerar = dono.getByRole("button", { name: "Gerar código de convite" });
  await hidratado(gerar);
  await gerar.click();
  const codigo = await dono.getByText(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/).textContent();
  if (!codigo) throw new Error("O convite não apareceu");
  await convidada.goto("/estante");
  const campo = convidada.getByLabel("Código do convite");
  await hidratado(campo);
  await campo.fill(codigo);
  await convidada.getByRole("button", { name: "Entrar no mundo" }).click();
  await expect(convidada).toHaveURL(new RegExp(`/mundos/${mundoId}$`));
}

/** O texto de todos os scripts que uma navegação baixou, mais o do próprio documento. */
export async function scriptsDe(page: Page, navegar: () => Promise<unknown>): Promise<string[]> {
  const pendentes: Promise<string>[] = [];
  const anotar = (resposta: Response) => {
    const tipo = resposta.request().resourceType();
    if (tipo === "script" || tipo === "document") pendentes.push(resposta.text().catch(() => ""));
  };
  page.on("response", anotar);
  await navegar();
  await page.waitForLoadState("networkidle");
  page.off("response", anotar);
  return Promise.all(pendentes);
}

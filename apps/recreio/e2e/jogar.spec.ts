import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { WebSocket as ConexaoDeFora } from "ws";
import { MARCA_DO_JOGO_DE_TESTE } from "../src/features/jogo-de-teste/cliente";
import {
  APP,
  comecarVigia,
  conceder,
  criarMundo as criarMundoNoJogo,
  esperarSaida,
  esquecerAparelho,
  fecharAparelhos,
  hidratado,
  linhasDeJson,
  novaPessoa,
  origemDoJogo as origemDe,
  saiu,
  scriptsDe,
  tela,
  vigia,
} from "./apoio";

/**
 * A plataforma de ponta a ponta, com navegadores de verdade, o portal em build
 * de produção, um banco descartável e o servidor do jogo de teste como
 * processo à parte, que o próprio teste inicia e derruba.
 *
 * Só roda por `pnpm e2e` (`scripts/isolated.mjs e2e`). Cada teste cria as suas
 * contas e não depende do que os outros deixaram; a ordem importa só para o
 * primeiro, que precisa encontrar o Recreio sem nenhuma instância do jogo.
 * O que é comum aos testes de navegador do portal fica em `apoio.ts`.
 */

const JOGO = "teste";
const origemDoJogo = () => origemDe(JOGO);
const criarMundo = (page: Page, nome: string) => criarMundoNoJogo(page, "Jogo de teste", nome);

// --- O servidor do jogo de teste, como processo filho ---

let servidor: ChildProcess | null = null;
let saidaDoServidor: string[] = [];

async function noAr(): Promise<boolean> {
  try {
    return (await fetch(`${origemDoJogo().http}/saude`)).ok;
  } catch {
    return false;
  }
}

/** Sobe uma instância e espera ela se registrar no Recreio e aceitar conexões. */
async function iniciarServidor(): Promise<void> {
  if (servidor) throw new Error("Já existe um servidor do jogo de teste em execução");
  const filho = spawn(process.execPath, ["--import", "tsx", "e2e/servidor/main.ts"], {
    cwd: APP,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  filho.stdout?.on("data", (parte: Buffer) => saidaDoServidor.push(parte.toString()));
  filho.stderr?.on("data", (parte: Buffer) => saidaDoServidor.push(parte.toString()));
  servidor = filho;
  await expect
    .poll(noAr, { timeout: 60_000, message: "o servidor do jogo de teste não subiu" })
    .toBe(true);
}

/** O que as instâncias desta execução registraram (uma linha de JSON por acontecimento). */
function registrosDoServidor(mensagem: string): Record<string, unknown>[] {
  return linhasDeJson(saidaDoServidor).filter((registro) => registro.mensagem === mensagem);
}

/**
 * Uma conexão com a instância feita de fora do navegador, para ver o que ela
 * responde: `http <status>` se recusou a subida, ou o primeiro quadro que mandou.
 */
function conectarDeFora(opcoes: { origem?: string; quadro?: unknown }): Promise<string> {
  return new Promise((resolver) => {
    const conexao = new ConexaoDeFora(
      origemDoJogo().ws,
      opcoes.origem === undefined ? {} : { origin: opcoes.origem },
    );
    const responder = (resposta: string) => {
      resolver(resposta);
      conexao.terminate();
    };
    conexao.on("unexpected-response", (_pedido, resposta) =>
      responder(`http ${resposta.statusCode}`),
    );
    conexao.on("open", () => {
      if (opcoes.quadro !== undefined) conexao.send(JSON.stringify(opcoes.quadro));
    });
    conexao.on("message", (dados) => responder(dados.toString()));
    conexao.on("close", () => resolver("fechou sem dizer nada"));
    conexao.on("error", () => resolver("erro de conexão"));
  });
}

/** Derruba a instância sem aviso, como uma queda de verdade. No Windows é um encerramento forçado. */
async function matarServidor(): Promise<void> {
  const filho = servidor;
  servidor = null;
  if (!filho) return;
  const fim = saiu(filho);
  filho.kill("SIGKILL");
  await fim;
  await expect.poll(noAr, { timeout: 15_000 }).toBe(false);
}

/** Descida ordenada: a instância avisa o Recreio, guarda os mundos e solta as posses. */
async function pararServidor(): Promise<void> {
  const filho = servidor;
  servidor = null;
  if (!filho) return;
  if (filho.connected) filho.send("descer");
  await esperarSaida(filho, 15_000);
}

test.beforeEach(() => {
  comecarVigia();
  saidaDoServidor = [];
});

test.afterEach(async () => {
  await fecharAparelhos();
  await pararServidor();
  if (test.info().status !== test.info().expectedStatus)
    await test.info().attach("servidor-do-jogo.log", {
      body: saidaDoServidor.join(""),
      contentType: "text/plain",
    });
  expect(vigia().violacoes, "violações da política de segurança").toEqual([]);
  expect(vigia().errosDePagina, "erros de script nas páginas").toEqual([]);
});

/** O que o jogo de teste mostra numa página. */
function jogoEm(page: Page) {
  return {
    contador: page.getByLabel("Valor do contador"),
    presentes: page.getByRole("list", { name: "Quem está aqui" }),
    somar: page.getByRole("button", { name: "Somar 1" }),
    aviso: page.locator("[data-jogo] [role=status]"),
    sairDaPagina: page.getByRole("button", { name: "Sair do jogo", exact: true }),
    sairPeloJogo: page.getByRole("button", { name: "Sair por dentro do jogo" }),
  };
}

const enderecoDoJogo = (mundoId: string) => `/jogar/${JOGO}?mundo=${mundoId}`;

// --- Os testes ---

test("recusas, jogo sem instância, política de segurança e isolamento do bundle", async ({
  browser,
}) => {
  const dora = await novaPessoa(browser, "Dora", { comAcesso: false });
  const eva = await novaPessoa(browser, "Eva");
  const mundoDaEva = await criarMundo(eva.page, "Mundo da Eva");

  await test.step("sem o direito de jogar, a página do jogo devolve para a estante", async () => {
    await dora.page.goto(enderecoDoJogo(mundoDaEva));
    await expect(dora.page).toHaveURL(/\/estante$/);
    await expect(
      dora.page.getByRole("heading", { name: "Acesso por convite da equipe" }),
    ).toBeVisible();
  });

  await test.step("jogo que não existe é 404; sem mundo, volta para a estante", async () => {
    const inexistente = await eva.page.goto(`/jogar/nao-existe?mundo=${mundoDaEva}`);
    expect(inexistente?.status()).toBe(404);
    await expect(eva.page.getByRole("heading", { name: "Este caminho não existe." })).toBeVisible();
    // O Morada tem página no portal, mas este mundo é de outro jogo: não abre nela.
    const deOutroJogo = await eva.page.goto(`/jogar/morada?mundo=${mundoDaEva}`);
    expect(deOutroJogo?.status()).toBe(200);
    await expect(
      eva.page.getByRole("heading", { name: "Este mundo não está disponível" }),
    ).toBeVisible();
    await eva.page.goto(`/jogar/${JOGO}`);
    await expect(eva.page).toHaveURL(/\/estante$/);
  });

  await test.step("mundo de outra pessoa responde igual a mundo que não existe", async () => {
    conceder(dora.email);
    const aviso = dora.page.locator("main");
    await dora.page.goto(enderecoDoJogo(mundoDaEva));
    await expect(
      dora.page.getByRole("heading", { name: "Este mundo não está disponível" }),
    ).toBeVisible();
    const deOutraPessoa = await aviso.innerText();
    await dora.page.goto(enderecoDoJogo(randomUUID()));
    await expect(
      dora.page.getByRole("heading", { name: "Este mundo não está disponível" }),
    ).toBeVisible();
    expect(await aviso.innerText()).toBe(deOutraPessoa);
    await dora.page.goto(`/jogar/${JOGO}?mundo=nao-e-um-id`);
    expect(await aviso.innerText()).toBe(deOutraPessoa);
  });

  await test.step("a estante não baixa o jogo; a página do jogo baixa, com a política dela", async () => {
    let politicaDaEstante = "";
    const daEstante = await scriptsDe(eva.page, async () => {
      const resposta = await eva.page.goto("/estante");
      politicaDaEstante = resposta?.headers()["content-security-policy"] ?? "";
    });
    expect(daEstante.length).toBeGreaterThan(3);
    expect(daEstante.filter((codigo) => codigo.includes(MARCA_DO_JOGO_DE_TESTE))).toEqual([]);
    expect(politicaDaEstante).toContain("connect-src 'self';");
    expect(politicaDaEstante).not.toContain("ws:");
    expect(politicaDaEstante).not.toContain("wasm-unsafe-eval");

    let politicaDoJogo = "";
    const doJogo = await scriptsDe(eva.page, async () => {
      // Pelo caminho que a pessoa faz: o "Jogar" do mundo, na estante.
      const [resposta] = await Promise.all([
        eva.page.waitForResponse((r) => r.request().resourceType() === "document"),
        eva.page.getByRole("link", { name: "Jogar em Mundo da Eva" }).click(),
      ]);
      politicaDoJogo = resposta.headers()["content-security-policy"] ?? "";
      // Sem nenhuma instância do jogo, a pessoa lê que o jogo está iniciando.
      await expect(eva.page.getByRole("heading", { name: "O jogo está iniciando" })).toBeVisible();
      await tela(eva.page, "jogo-iniciando");
    });
    await expect(eva.page).toHaveURL(enderecoDoJogo(mundoDaEva));
    expect(doJogo.some((codigo) => codigo.includes(MARCA_DO_JOGO_DE_TESTE))).toBe(true);
    expect(politicaDoJogo).toContain(`connect-src 'self' ${origemDoJogo().ws};`);
    expect(politicaDoJogo).toContain("'wasm-unsafe-eval'");
    expect(politicaDoJogo).toContain("worker-src 'self' blob:");
    // O build é de produção: nada de `eval` de texto nem WebSocket para qualquer lugar.
    expect(politicaDoJogo).not.toContain("'unsafe-eval'");
    expect(politicaDoJogo).not.toMatch(/ wss?:(;| )/);
    // Nada de quem joga está escrito no documento: nem o e-mail, nem um token.
    const documento = await eva.page.content();
    expect(documento).not.toContain(eva.email);
    expect(documento).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
  });

  await test.step("com a instância no ar, tentar de novo abre o jogo", async () => {
    await expect(eva.page.getByText("Tente de novo em instantes.")).toBeVisible();
    await iniciarServidor();
    await eva.page.getByRole("button", { name: "Tentar de novo" }).click();
    const jogo = jogoEm(eva.page);
    await expect(jogo.presentes).toContainText("Eva (você)");
    await expect(jogo.contador).toHaveText("0");
    await jogo.somar.click();
    await expect(jogo.contador).toHaveText("1");
  });

  await test.step("a instância só atende o portal, e só com a sessão no primeiro quadro", async () => {
    const portal = test.info().project.use.baseURL ?? "";
    expect(await conectarDeFora({ origem: "http://outro-lugar.example" })).toBe("http 403");
    expect(await conectarDeFora({})).toBe("http 403");
    const semSessao = await conectarDeFora({
      origem: portal,
      quadro: { t: "entrar", token: "nao-e-uma-sessao", mundoId: mundoDaEva },
    });
    expect(JSON.parse(semSessao)).toEqual({ t: "fim", codigo: "SESSAO_INVALIDA" });
    const semEntrar = await conectarDeFora({
      origem: portal,
      quadro: { t: "somar", id: randomUUID() },
    });
    expect(JSON.parse(semEntrar)).toEqual({ t: "fim", codigo: "ENTRADA_INVALIDA" });
    // Nada disso mexeu no mundo de quem está jogando.
    await expect(jogoEm(eva.page).contador).toHaveText("1");
  });
});

test("duas contas no mesmo mundo: presença, queda de um jogador e queda da instância", async ({
  browser,
}) => {
  await iniciarServidor();
  const ana = await novaPessoa(browser, "Ana");
  const bia = await novaPessoa(browser, "Bia");
  let mundoId = "";

  await test.step("Ana cria o mundo e convida; Bia entra com o código", async () => {
    mundoId = await criarMundo(ana.page, "Casa da Ana");
    const gerar = ana.page.getByRole("button", { name: "Gerar código de convite" });
    await hidratado(gerar);
    await gerar.click();
    const codigo = await ana.page.getByText(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/).textContent();
    if (!codigo) throw new Error("O convite não apareceu");
    await bia.page.goto("/estante");
    const campo = bia.page.getByLabel("Código do convite");
    await hidratado(campo);
    await campo.fill(codigo);
    await bia.page.getByRole("button", { name: "Entrar no mundo" }).click();
    await expect(bia.page).toHaveURL(new RegExp(`/mundos/${mundoId}$`));
  });

  const daAna = jogoEm(ana.page);
  const daBia = jogoEm(bia.page);

  await test.step("as duas abrem o jogo, veem uma à outra e somam", async () => {
    await ana.page.goto("/estante");
    await ana.page.getByRole("link", { name: "Jogar em Casa da Ana" }).click();
    await expect(ana.page).toHaveURL(enderecoDoJogo(mundoId));
    await bia.page.goto(enderecoDoJogo(mundoId));
    await expect(daAna.presentes).toContainText("Ana (você)");
    await expect(daAna.presentes).toContainText("Bia");
    await expect(daBia.presentes).toContainText("Bia (você)");
    await expect(daBia.presentes).toContainText("Ana");
    await tela(ana.page, "jogando");
    await expect(daAna.contador).toHaveText("0");
    await daAna.somar.click();
    await expect(daAna.contador).toHaveText("1");
    await expect(daBia.contador).toHaveText("1");
    await daBia.somar.click();
    await expect(daBia.contador).toHaveText("2");
    await expect(daAna.contador).toHaveText("2");
  });

  await test.step("o aparelho da Bia some: Ana continua e deixa de ver a Bia", async () => {
    esquecerAparelho(bia.contexto);
    await bia.contexto.close();
    await expect(daAna.presentes).not.toContainText("Bia");
    await expect(daAna.presentes).toContainText("Ana (você)");
    await daAna.somar.click();
    await expect(daAna.contador).toHaveText("3");
  });

  await test.step("Ana sai pela página: o mundo vazio é fotografado e ela volta ao mesmo valor", async () => {
    await daAna.sairDaPagina.click();
    await expect(ana.page).toHaveURL(/\/estante$/);
    // O resumo do cartão vem da fotografia que a instância gravou ao esvaziar.
    await expect(async () => {
      await ana.page.reload();
      await expect(ana.page.getByText("Contador em 3")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await ana.page.getByRole("link", { name: "Jogar em Casa da Ana" }).click();
    await expect(daAna.contador).toHaveText("3");
    await expect(daAna.presentes).toContainText("Ana (você)");
    // Esta soma fica só no diário, depois da fotografia.
    await daAna.somar.click();
    await expect(daAna.contador).toHaveText("4");
  });

  await test.step("a instância morre sem aviso; outra assume e o valor é o mesmo", async () => {
    await matarServidor();
    await expect(daAna.aviso).toHaveText("Reconectando…");
    await expect(daAna.somar).toBeDisabled();
    await iniciarServidor();
    // A posse da instância morta vale por até 30 s; só depois o Recreio a entrega à nova.
    await expect(daAna.somar).toBeEnabled({ timeout: 90_000 });
    await expect(daAna.aviso).toHaveText("");
    await expect(daAna.contador).toHaveText("4");
    await expect(daAna.presentes).toContainText("Ana (você)");
    await daAna.somar.click();
    await expect(daAna.contador).toHaveText("5");
    // O caminho da recuperação, visto do lado da instância: cada abertura do
    // mundo com uma cerca maior, e a última montada da fotografia (3) mais a
    // soma que só estava no diário.
    const aberturas = registrosDoServidor("mundo aberto").filter(
      (registro) => registro.mundo === mundoId,
    );
    expect(aberturas.map((registro) => registro.cerca)).toEqual([1, 2, 3]);
    expect(aberturas.at(-1)).toMatchObject({ contador: 4, comFotografia: true, doDiario: 1 });
  });

  await test.step("sair por dentro do jogo também volta à estante", async () => {
    await daAna.sairPeloJogo.click();
    await expect(ana.page).toHaveURL(/\/estante$/);
  });
});

test("um perfil joga em um lugar por vez, e sair da conta encerra o jogo", async ({ browser }) => {
  await iniciarServidor();
  const caio = await novaPessoa(browser, "Caio");
  const mundoId = await criarMundo(caio.page, "Mundo do Caio");
  const primeira = caio.page;
  const daPrimeira = jogoEm(primeira);

  await primeira.goto(enderecoDoJogo(mundoId));
  await expect(daPrimeira.presentes).toContainText("Caio (você)");

  await test.step("recarregar a página volta direto ao jogo, sem pergunta", async () => {
    // A página que sai encerra a própria sessão; a que entra abre outra.
    await primeira.reload();
    await expect(daPrimeira.presentes).toContainText("Caio (você)");
    await expect(daPrimeira.somar).toBeEnabled();
  });

  const segunda = await caio.contexto.newPage();
  const daSegunda = jogoEm(segunda);

  await test.step("a segunda aba pergunta antes de continuar", async () => {
    await segunda.goto(enderecoDoJogo(mundoId));
    await expect(
      segunda.getByRole("heading", { name: "Você já está jogando em outro lugar" }),
    ).toBeVisible();
    await tela(segunda, "ja-aberto");
    await expect(segunda.getByText("Continuar aqui?")).toBeVisible();
    // Enquanto a pessoa não escolhe, a primeira aba segue jogando.
    await daPrimeira.somar.click();
    await expect(daPrimeira.contador).toHaveText("1");
  });

  await test.step("continuar aqui encerra a sessão da primeira aba, com a explicação", async () => {
    await segunda.getByRole("button", { name: "Continuar aqui" }).click();
    await expect(daSegunda.presentes).toContainText("Caio (você)");
    await expect(daSegunda.contador).toHaveText("1");
    await expect(
      primeira.getByRole("heading", { name: "Você continuou o jogo em outro lugar" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(primeira.getByRole("button", { name: "Jogar aqui" })).toBeVisible();
    await expect(daPrimeira.somar).toHaveCount(0);
    // A segunda aba não foi afetada pela saída da primeira.
    await daSegunda.somar.click();
    await expect(daSegunda.contador).toHaveText("2");
  });

  await test.step("sair da conta numa aba encerra o jogo na outra, pelo batimento", async () => {
    await primeira.goto("/conta");
    const sair = primeira.getByRole("button", { name: "Sair da conta" });
    await hidratado(sair);
    await sair.click();
    await expect(primeira).toHaveURL(/\/$/);
    // A instância fica sabendo no batimento seguinte (10 s).
    await expect(segunda.getByRole("heading", { name: "Você saiu da conta" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(daSegunda.somar).toHaveCount(0);
    await segunda.getByRole("button", { name: "Entrar de novo" }).click();
    await expect(segunda).toHaveURL(/\/entrar/);
  });
});

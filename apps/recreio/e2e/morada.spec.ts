import { MARCA_DO_CLIENTE } from "@informach/jogo-morada";
import {
  type BrowserServer,
  type ConsoleMessage,
  chromium,
  expect,
  type Locator,
  test,
} from "@playwright/test";
import {
  comecarVigia,
  convidar,
  criarMundo,
  entrarDeNovo,
  esquecerAparelho,
  fecharAparelhos,
  hidratado,
  medida,
  novaPessoa,
  observarDesenho,
  origemDoJogo,
  perfilarCpu,
  scriptsDe,
  segredoDoJogo,
  tela,
  telaComDesenho,
  tolerando,
  vigia,
} from "./apoio";
import {
  type AlvoNaCena,
  clicarNaCena,
  enderecoDoJogo,
  iniciarServidor,
  JOGO,
  jogoEm,
  limparSaidaDoServidor,
  localDe,
  matarServidor,
  minutosDeJogo,
  mundoNaTela,
  pararServidor,
  registros,
  saidaDoServidor,
  varrerCena,
} from "./morada-apoio";
import { ARGS_DO_NAVEGADOR, CANAL_DO_NAVEGADOR } from "./navegador";

/**
 * A condição de saída da etapa 1, de ponta a ponta: duas contas diferentes
 * jogam a mesma família, uma cai, a outra continua, e tudo volta depois de
 * derrubar a instância. Pelo portal de verdade (build de produção), pela API
 * do Recreio de verdade, com um banco de verdade e com o servidor do Morada de
 * verdade, como processo à parte, morto por sinal.
 *
 * Tudo é conferido pelo que a pessoa vê: o HUD do jogo, os nomes acessíveis e
 * os atributos `data-morada-*`. O cliente é montado como em produção, sem a
 * opção de depuração. Do lado da instância, o teste lê o registro que ela
 * escreve.
 */

/** Um nome que só existe dentro do three.js: onde ele está, o jogo inteiro está. */
const SINAL_DO_THREE = "WebGLRenderer";
const FAMILIA = ["Lia", "Marcos", "Nina", "Vó Ana"];
const metros = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

async function posicionarPelaInterface(painel: Locator, pos: [number, number]): Promise<void> {
  const previa = painel.getByLabel("Posição da prévia", { exact: true });
  await painel.getByLabel("Largura (m)", { exact: true }).fill(String(pos[0]));
  await expect(previa).toContainText(`${metros.format(pos[0])} ×`);
  await painel.getByLabel("Profundidade (m)", { exact: true }).fill(String(pos[1]));
  await expect(previa).toHaveText(`${metros.format(pos[0])} × ${metros.format(pos[1])} m · 0°`);
}

async function procurarPosicaoLivre(painel: Locator): Promise<[number, number]> {
  for (let y = 4.5; y <= 8; y += 0.5)
    for (let x = 3; x <= 7; x += 0.5) {
      await posicionarPelaInterface(painel, [x, y]);
      if (await painel.getByRole("button", { name: /Comprar por M\$/ }).isEnabled()) return [x, y];
    }
  throw new Error("Casa sem posição livre para a compra pela interface");
}

declare global {
  interface Window {
    graficaDaCriacao?: {
      contextos: number;
      buffers: number;
      texturas: number;
      maximoBuffers: number;
      maximoTexturas: number;
    };
  }
}
const TODAS_AS_PERMISSOES = [
  "autorizar_mudanca",
  "chamar_morador",
  "comandar",
  "construir",
  "decidir_vida",
  "decorar",
  "editar_aparencia",
  "gastar",
  "gerir_financas",
  "gerir_mundo",
  "gerir_servicos",
  "ver",
];

/** O navegador da pessoa que vai cair: um processo à parte, para poder morrer sem aviso. */
let navegadorQueCai: BrowserServer | null = null;

/** Cada aparelho da Bia tem processo próprio, inclusive depois de reiniciar. */
async function novoNavegadorDaBia() {
  if (navegadorQueCai) throw new Error("O navegador anterior da Bia ainda precisa ser encerrado");
  navegadorQueCai = await chromium.launchServer({
    channel: CANAL_DO_NAVEGADOR,
    args: ARGS_DO_NAVEGADOR,
  });
  return chromium.connect(navegadorQueCai.wsEndpoint());
}

/**
 * Com a instância fora do ar, o navegador registra no console cada conexão
 * recusada com o servidor do jogo. É o efeito esperado da queda que o teste
 * provoca, e só conta como esperado nesse trecho.
 */
function ehFalhaDaQueda(mensagem: ConsoleMessage): boolean {
  return mensagem.text().includes(`WebSocket connection to '${origemDoJogo(JOGO).ws}`);
}

test.beforeEach(() => {
  comecarVigia();
  limparSaidaDoServidor();
});

test.describe("coleção real da criação", () => {
  test.skip(
    !process.env.MORADA_ARTE_DIR,
    "As 48 prévias exigem o pacote privado de arte da criação",
  );
  test("cria, joga e reabre uma família personalizada", { tag: "@personalizacao" }, async ({
    browser,
  }) => {
    test.setTimeout(600_000);
    await iniciarServidor();
    const pessoa = await novaPessoa(browser, "Criadora");
    await pessoa.page.addInitScript(() => {
      const medida = { contextos: 0, buffers: 0, texturas: 0, maximoBuffers: 0, maximoTexturas: 0 };
      window.graficaDaCriacao = medida;
      const contextos = new Set<WebGL2RenderingContext>();
      const buffers = new Set<WebGLBuffer>();
      const texturas = new Set<WebGLTexture>();
      const gl = WebGL2RenderingContext.prototype;
      const criarBuffer = gl.createBuffer,
        apagarBuffer = gl.deleteBuffer,
        criarTextura = gl.createTexture,
        apagarTextura = gl.deleteTexture;
      gl.createBuffer = function (this: WebGL2RenderingContext) {
        contextos.add(this);
        medida.contextos = contextos.size;
        const buffer = criarBuffer.call(this);
        if (buffer) buffers.add(buffer);
        medida.buffers = buffers.size;
        medida.maximoBuffers = Math.max(medida.maximoBuffers, medida.buffers);
        return buffer;
      };
      gl.deleteBuffer = function (this: WebGL2RenderingContext, buffer) {
        if (buffer) buffers.delete(buffer);
        medida.buffers = buffers.size;
        apagarBuffer.call(this, buffer);
      };
      gl.createTexture = function (this: WebGL2RenderingContext) {
        const textura = criarTextura.call(this);
        if (textura) texturas.add(textura);
        medida.texturas = texturas.size;
        medida.maximoTexturas = Math.max(medida.maximoTexturas, medida.texturas);
        return textura;
      };
      gl.deleteTexture = function (this: WebGL2RenderingContext, textura) {
        if (textura) texturas.delete(textura);
        medida.texturas = texturas.size;
        apagarTextura.call(this, textura);
      };
    });
    const mundoId = await criarMundo(pessoa.page, "Morada", "Casa da Lua");
    await pessoa.page.goto(enderecoDoJogo(mundoId));
    await expect(pessoa.page.getByRole("heading", { name: "Quem vai morar aqui?" })).toBeVisible();
    await pessoa.page.getByRole("button", { name: "Criar minha família", exact: true }).click();
    await pessoa.page.getByLabel("Nome da família", { exact: true }).fill("Lua e Sol");
    await pessoa.page.getByLabel("Nome no jogo", { exact: true }).fill("Lua");
    const previa = pessoa.page.locator(".morada-criacao-previa [role='status']");
    const fases = ["colo", "pequeno", "crianca", "adolescente", "adulto", "idoso"];
    let combinacoes = 0;
    for (const fase of fases)
      for (const linha of ["f", "m"])
        for (const cabelo of ["natural", "careca"])
          for (const roupa of ["cotidiano", "macacao"]) {
            await pessoa.page
              .getByRole("combobox", { name: "Fase da vida", exact: true })
              .selectOption(fase);
            await pessoa.page
              .getByRole("combobox", { name: "Tipo de corpo", exact: true })
              .selectOption(linha);
            await pessoa.page
              .getByRole("combobox", { name: "Cabelo", exact: true })
              .selectOption(cabelo);
            await pessoa.page
              .getByRole("combobox", { name: "Roupa", exact: true })
              .selectOption(roupa);
            await expect(previa).toHaveText("Assim vai ficar");
            if (cabelo === "natural" && roupa === "cotidiano")
              await tela(pessoa.page, `criacao-${fase}-${linha}`);
            combinacoes++;
          }
    expect(combinacoes).toBe(48);
    await pessoa.page
      .getByRole("combobox", { name: "Fase da vida", exact: true })
      .selectOption("adulto");
    await pessoa.page
      .getByRole("combobox", { name: "Tipo de corpo", exact: true })
      .selectOption("f");
    await pessoa.page
      .getByRole("combobox", { name: "Cabelo", exact: true })
      .selectOption("natural");
    await pessoa.page
      .getByRole("combobox", { name: "Roupa", exact: true })
      .selectOption("cotidiano");
    await expect(previa).toHaveText("Assim vai ficar");
    const ciclos = async () => {
      for (const cabelo of ["careca", "natural"])
        for (const roupa of ["macacao", "cotidiano"]) {
          await pessoa.page
            .getByRole("combobox", { name: "Cabelo", exact: true })
            .selectOption(cabelo);
          await pessoa.page
            .getByRole("combobox", { name: "Roupa", exact: true })
            .selectOption(roupa);
          await expect(previa).toHaveText("Assim vai ficar");
        }
    };
    await ciclos();
    const antes = await pessoa.page.evaluate(() => window.graficaDaCriacao);
    await ciclos();
    await ciclos();
    const depois = await pessoa.page.evaluate(() => window.graficaDaCriacao);
    expect(antes?.contextos).toBe(1);
    expect(depois?.contextos).toBe(1);
    expect(depois?.buffers).toBe(antes?.buffers);
    expect(depois?.texturas).toBe(antes?.texturas);
    await medida("criacao-recursos", { combinacoes, antes, depois });
    await test.info().attach("criacao-recursos.json", {
      body: JSON.stringify({ combinacoes, antes, depois }, null, 2),
      contentType: "application/json",
    });
    await pessoa.page.setViewportSize({ width: 390, height: 844 });
    await expect(
      pessoa.page.getByRole("heading", { name: "Moradores", exact: true }),
    ).toBeVisible();
    await expect(previa).toHaveText("Assim vai ficar");
    expect(
      await pessoa.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await tela(pessoa.page, "criacao-celular");
    await pessoa.page.setViewportSize({ width: 1280, height: 800 });
    await pessoa.page.getByRole("button", { name: /Adicionar morador/ }).click();
    await pessoa.page.getByLabel("Nome no jogo", { exact: true }).fill("Sol");
    await pessoa.page
      .getByRole("combobox", { name: "Tipo de corpo", exact: true })
      .selectOption("m");
    await expect(previa).toHaveText("Assim vai ficar");
    await pessoa.page.getByRole("button", { name: "Continuar", exact: true }).click();
    await pessoa.page.getByRole("button", { name: "Adicionar relação", exact: true }).click();
    await pessoa.page
      .getByRole("combobox", { name: "Vínculo", exact: true })
      .selectOption("casamento");
    await pessoa.page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(
      pessoa.page.getByRole("heading", { name: "Seu novo lar", exact: true }),
    ).toBeVisible();
    await pessoa.page.getByRole("button", { name: "Começar a jogar", exact: true }).click();
    const jogo = jogoEm(pessoa.page);
    await mundoNaTela(jogo);
    await expect(jogo.nomes).toHaveText(["Lua", "Sol"]);
    await jogo.retrato("Lua").click();
    await expect(jogo.retrato("Lua")).toHaveAttribute("data-estado", "voce");
    await jogo.sair.click();
    await expect(pessoa.page).toHaveURL(/\/estante/);
    await pessoa.page.getByRole("link", { name: "Jogar em Casa da Lua" }).click();
    await mundoNaTela(jogo);
    await expect(jogo.nomes).toHaveText(["Lua", "Sol"]);
    await expect(pessoa.page.getByRole("heading", { name: "Quem vai morar aqui?" })).toHaveCount(0);
  });
});

test.afterEach(async () => {
  await fecharAparelhos();
  await navegadorQueCai?.kill().catch(() => undefined);
  navegadorQueCai = null;
  const desceuSozinho = await pararServidor();
  if (test.info().status !== test.info().expectedStatus)
    await test.info().attach("morada-server.log", {
      body: saidaDoServidor(),
      contentType: "text/plain",
    });
  // Com o portal no ar o tempo todo, nenhuma instância perde um mundo nem deixa
  // de gravar. Batimento que falhou (o portal demorou mais de 10 s) não quebra
  // nada, mas fica anotado para quem lê o resultado.
  expect(registros("posse_perdida"), "mundos perdidos pelas instâncias").toEqual([]);
  expect(registros("diario_indisponivel"), "diário que não respondeu").toEqual([]);
  const batimentos = `${registros("batimento").length} confirmados, ${registros("batimento_falhou").length} sem resposta`;
  const fotografias = registros("fotografia_gravada").map((registro) => Number(registro.bytes));
  test.info().annotations.push({ type: "batimentos", description: batimentos });
  console.log(
    `[morada] batimentos: ${batimentos}; fotografias: ${fotografias.length}, de ${Math.min(...fotografias)} a ${Math.max(...fotografias)} bytes`,
  );
  // Nada de segredo nem de token no que a instância escreveu.
  expect(saidaDoServidor()).not.toContain(segredoDoJogo(JOGO));
  expect(saidaDoServidor()).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  expect(desceuSozinho, "o servidor do Morada desceu no prazo quando pedido").toBe(true);
  expect(vigia().violacoes, "violações da política de segurança").toEqual([]);
  expect(vigia().errosDePagina, "erros de script nas páginas").toEqual([]);
  expect(vigia().errosDeConsole, "erros no console").toEqual([]);
});

test("cliente novo joga no servidor publicado antes do corte", { tag: "@compatibilidade" }, async ({
  browser,
}) => {
  const pastaAnterior = process.env.RECREIO_E2E_HOST_ANTERIOR_DIR;
  test.skip(!pastaAnterior, "Exige o build isolado do host publicado");
  if (!pastaAnterior) throw new Error("Host anterior ausente");
  const arteAnterior = process.env.RECREIO_E2E_ARTE_ANTERIOR_DIR;
  await iniciarServidor(arteAnterior ? { MORADA_ARTE_DIR: arteAnterior } : {}, {
    pasta: pastaAnterior,
  });
  const pessoa = await novaPessoa(browser, "Transicao");
  const mundoId = await criarMundo(pessoa.page, "Morada", "Casa da transicao");
  await pessoa.page.goto(enderecoDoJogo(mundoId));
  const jogo = jogoEm(pessoa.page);
  await mundoNaTela(jogo);
  await expect(jogo.retratos).toHaveCount(4);
  await expect(pessoa.page.getByRole("button", { name: "Decorar", exact: true })).toHaveCount(0);
  const antes = await minutosDeJogo(jogo);
  await expect.poll(() => minutosDeJogo(jogo)).toBeGreaterThan(antes);
  await tela(pessoa.page, "cliente-novo-host-publicado");
  await jogo.sair.click();
  await expect(pessoa.page).toHaveURL(/\/estante/);
  await pessoa.page.getByRole("link", { name: "Jogar em Casa da transicao", exact: true }).click();
  await mundoNaTela(jogo);
  await expect(jogo.retratos).toHaveCount(4);
  await jogo.sair.click();
  await expect(pessoa.page).toHaveURL(/\/estante/);
  await medida("cliente-novo-host-publicado", {
    entrou: true,
    relogioAvancou: true,
    saiuSalvo: true,
    reabriu: true,
    edicaoIndisponivel: true,
  });
});

test("duas contas reservam espaço, liberam ao reconectar e conservam uma única compra", {
  tag: "@concorrencia",
}, async ({ browser }) => {
  test.setTimeout(600_000);
  await iniciarServidor();
  const ana = await novaPessoa(browser, "Ana"),
    bia = await novaPessoa(browser, "Bia");
  const concluirPerfil = await perfilarCpu(bia.page, "cpu-bia-concorrencia");
  try {
    const mundoId = await criarMundo(ana.page, "Morada", "Casa compartilhada");
    await convidar(ana.page, bia.page, mundoId);
    await ana.page.goto(enderecoDoJogo(mundoId));
    await mundoNaTela(jogoEm(ana.page));
    await bia.page.goto(enderecoDoJogo(mundoId));
    await mundoNaTela(jogoEm(bia.page));
    await ana.page.getByRole("button", { name: "Pausar", exact: true }).click();
    await bia.page.getByRole("button", { name: "Concordar", exact: true }).click();
    await expect(ana.page.getByRole("button", { name: "Pausar", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const pessoa of [ana, bia])
      await pessoa.page.getByRole("button", { name: "Decorar", exact: true }).click();
    const daAna = ana.page.getByRole("region", { name: "Decoração da casa" });
    const daBia = bia.page.getByRole("region", { name: "Decoração da casa" });
    const quantidadeAntes = Number(
      (await daBia.getByRole("button", { name: /Na casa/ }).innerText()).match(/\d+/)?.[0],
    );
    expect(Number.isInteger(quantidadeAntes)).toBe(true);
    const mesa = /Mesa lateral.*M\$/;
    await daAna.getByRole("button", { name: mesa }).click();
    const posicaoDoConflito = await procurarPosicaoLivre(daAna);
    await expect(
      daBia.getByRole("complementary", { name: "Outras pessoas decorando" }),
    ).toContainText("Ana");
    await daBia.getByRole("button", { name: mesa }).click();
    await posicionarPelaInterface(daBia, posicaoDoConflito);
    await expect(daBia.getByRole("button", { name: /Comprar por M\$/ })).toBeDisabled();
    await expect(daBia.getByText("Ana está editando este espaço.", { exact: true })).toBeVisible();
    await bia.page.getByRole("button", { name: "Vista superior", exact: true }).click();
    await tela(bia.page, "obra-compartilhada-ocupada");
    await daAna.getByRole("button", { name: "Trocar seleção", exact: false }).click();
    await expect(daBia.getByRole("button", { name: /Comprar por M\$/ })).toBeEnabled();
    await expect(
      daAna.getByRole("complementary", { name: "Outras pessoas decorando" }),
    ).toContainText("Bia");
    await bia.page.reload();
    await mundoNaTela(jogoEm(bia.page));
    await expect(
      daAna.getByRole("complementary", { name: "Outras pessoas decorando" }),
    ).toHaveCount(0);
    // Quem voltou não havia concordado com a pausa; o acordo precisa ser renovado.
    await bia.page.getByRole("button", { name: "Pausar", exact: true }).click();
    const concordar = ana.page.getByRole("button", { name: "Concordar", exact: true });
    await expect(concordar).toBeVisible();
    const relogio = await ana.page.getByRole("region", { name: "Relógio do jogo" }).boundingBox();
    const ferramentas = await ana.page
      .getByRole("navigation", { name: "Ferramentas da cena" })
      .boundingBox();
    expect(relogio).not.toBeNull();
    expect(ferramentas).not.toBeNull();
    if (!relogio || !ferramentas) throw new Error("Relógio e ferramentas precisam estar na tela");
    expect(ferramentas.y).toBeGreaterThanOrEqual(relogio.y + relogio.height);
    await ana.page.getByRole("button", { name: "Concordar", exact: true }).click();
    await expect(bia.page.getByRole("button", { name: "Pausar", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await bia.page.getByRole("button", { name: "Decorar", exact: true }).click();
    await daBia.getByRole("button", { name: mesa }).click();
    const posicao = await procurarPosicaoLivre(daBia);
    const saldo = await daBia.locator(".morada-edicao-saldo b").innerText();
    await daBia.getByRole("button", { name: /Comprar por M\$/ }).click();
    await expect(daBia.getByText("Edição confirmada.", { exact: true })).toBeVisible();
    const saldoDepois = await daBia.locator(".morada-edicao-saldo b").innerText();
    const centavos = (texto: string) => Number(texto.replace(/[^\d]/g, ""));
    expect(centavos(saldo) - centavos(saldoDepois)).toBe(9_500);
    await expect(daAna.locator(".morada-edicao-saldo b")).toHaveText(saldoDepois);
    await expect(daAna.getByRole("button", { name: "Desfazer", exact: true })).toBeDisabled();
    await jogoEm(bia.page).sair.click();
    await expect(bia.page).toHaveURL(/\/estante/);
    await jogoEm(ana.page).sair.click();
    await expect(ana.page).toHaveURL(/\/estante/);
    expect(await pararServidor()).toBe(true);
    await iniciarServidor();
    await bia.page.goto(enderecoDoJogo(mundoId));
    await mundoNaTela(jogoEm(bia.page));
    await bia.page.getByRole("button", { name: "Decorar", exact: true }).click();
    await expect(daBia.locator(".morada-edicao-saldo b")).toHaveText(saldoDepois);
    await daBia.getByRole("button", { name: /Na casa/ }).click();
    await expect(daBia.getByRole("button", { name: /Na casa/ })).toContainText(
      String(quantidadeAntes + 1),
    );
    await daBia
      .getByRole("button", { name: /Mesa lateral redonda Peça \d+$/ })
      .last()
      .click();
    await expect(daBia.getByLabel("Largura (m)", { exact: true })).toHaveValue(String(posicao[0]));
    await expect(daBia.getByLabel("Profundidade (m)", { exact: true })).toHaveValue(
      String(posicao[1]),
    );
    await daBia.getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect(
      daBia.getByRole("button", { name: "Confirmar desfazer", exact: true }),
    ).toBeDisabled();
    await daBia.getByRole("checkbox", { name: "Conferi a mudança e o valor", exact: true }).check();
    await daBia.getByRole("button", { name: "Confirmar desfazer", exact: true }).click();
    await expect(daBia.getByText("Edição confirmada.", { exact: true })).toBeVisible();
    await expect(daBia.locator(".morada-edicao-saldo b")).toHaveText(saldo);
    await expect(daBia.getByRole("button", { name: /Na casa/ })).toContainText(
      String(quantidadeAntes),
    );
    await daBia.getByRole("button", { name: "Refazer", exact: true }).click();
    await daBia.getByRole("checkbox", { name: "Conferi a mudança e o valor", exact: true }).check();
    await daBia.getByRole("button", { name: "Confirmar refazer", exact: true }).click();
    await expect(daBia.getByText("Edição confirmada.", { exact: true })).toBeVisible();
    await expect(daBia.locator(".morada-edicao-saldo b")).toHaveText(saldoDepois);
    await expect(daBia.getByRole("button", { name: /Na casa/ })).toContainText(
      String(quantidadeAntes + 1),
    );
    await jogoEm(bia.page).sair.click();
    await expect(bia.page).toHaveURL(/\/estante/);
    expect(await pararServidor()).toBe(true);
    await iniciarServidor();
    await bia.page.goto(enderecoDoJogo(mundoId));
    await mundoNaTela(jogoEm(bia.page));
    await bia.page.getByRole("button", { name: "Decorar", exact: true }).click();
    await expect(daBia.locator(".morada-edicao-saldo b")).toHaveText(saldoDepois);
    await expect(daBia.getByRole("button", { name: "Desfazer", exact: true })).toBeEnabled();
    await expect(daBia.getByRole("button", { name: "Refazer", exact: true })).toBeDisabled();
    await daBia.getByRole("button", { name: /Na casa/ }).click();
    await daBia
      .getByRole("button", { name: /Mesa lateral redonda Peça \d+$/ })
      .last()
      .click();
    await expect(daBia.getByLabel("Largura (m)", { exact: true })).toHaveValue(String(posicao[0]));
    await expect(daBia.getByLabel("Profundidade (m)", { exact: true })).toHaveValue(
      String(posicao[1]),
    );
    await medida("obra-compartilhada", {
      contas: 2,
      convitePeloPortal: true,
      conflitoVisivel: true,
      reconexaoLiberou: true,
      compraUnica: true,
      restaurou: true,
      historicoSomenteDoAutor: true,
      desfazerCompra: true,
      refazerCompra: true,
      historicoRestaurado: true,
      posicaoDoConflito,
      posicao,
      saldoAntes: saldo,
      saldoDepois,
    });
  } finally {
    await concluirPerfil();
  }
});

for (const aparelho of [
  { nome: "computador", viewport: { width: 1365, height: 900 } },
  { nome: "celular", viewport: { width: 390, height: 844 } },
]) {
  test(`compra, gira e pinta com arte real; restaura saldo e escolhas (${aparelho.nome})`, {
    tag: "@decoracao",
  }, async ({ browser }) => {
    test.skip(
      process.env.RECREIO_E2E_PINTURA !== "1",
      "Exige o pacote V4 e a homologação privada de pintura",
    );
    expect(process.env.MORADA_ARTE_DIR).toBeTruthy();
    test.setTimeout(600_000);
    await iniciarServidor();
    const pessoa = await novaPessoa(browser, "Decoradora");
    await observarDesenho(pessoa.page);
    await pessoa.page.setViewportSize(aparelho.viewport);
    const mundoId = await criarMundo(pessoa.page, "Morada", "Casa das cores");
    await pessoa.page.goto(enderecoDoJogo(mundoId));
    const jogo = jogoEm(pessoa.page);
    await mundoNaTela(jogo);
    await pessoa.page.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(pessoa.page.getByRole("button", { name: "Pausar", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await pessoa.page.getByRole("button", { name: "Decorar", exact: true }).click();
    const painel = pessoa.page.getByRole("region", { name: "Decoração da casa" });
    await painel.getByRole("button", { name: /Mesa lateral.*M\$/ }).click();
    const comprar = painel.getByRole("button", { name: /Comprar por M\$/ });
    const posicao = await procurarPosicaoLivre(painel);
    await painel.getByRole("button", { name: /Girar 90°/ }).click();
    await expect(painel.getByLabel("Orientação do móvel")).toHaveText("90°");
    await painel.getByLabel("Cor do móvel").fill("#0055ff");
    await expect(
      painel.getByRole("button", { name: "Arte original", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await pessoa.page.getByRole("button", { name: "Vista superior", exact: true }).click();
    await painel.getByRole("button", { name: "Ver prévia na casa" }).click();
    await telaComDesenho(pessoa.page, `decoracao-${aparelho.nome}-previa-azul`);
    await comprar.click();
    await expect(painel.getByText("Edição confirmada.", { exact: true })).toBeVisible();
    const saldo = await painel.locator(".morada-edicao-saldo b").innerText();
    await painel.getByRole("button", { name: /Na casa/ }).click();
    const novaMesa = () =>
      painel.getByRole("button", { name: /Mesa lateral redonda Peça \d+$/ }).last();
    await novaMesa().click();
    await expect(painel.getByLabel("Orientação do móvel")).toHaveText("90°");
    await painel.getByRole("button", { name: "Pintar", exact: true }).click();
    await expect(painel.getByLabel("Cor do móvel")).toHaveValue("#0055ff");
    await painel.getByLabel("Cor do móvel").fill("#000000");
    await painel.getByRole("button", { name: "Aplicar pintura", exact: true }).click();
    await expect(painel.getByText("Edição confirmada.", { exact: true })).toBeVisible();
    await expect(painel.locator(".morada-edicao-saldo b")).toHaveText(saldo);
    await jogo.sair.click();
    await expect(pessoa.page).toHaveURL(/\/estante/);
    expect(await pararServidor()).toBe(true);
    await iniciarServidor();
    await pessoa.page.getByRole("link", { name: "Jogar em Casa das cores", exact: true }).click();
    await mundoNaTela(jogo);
    await pessoa.page.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(pessoa.page.getByRole("button", { name: "Pausar", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await pessoa.page.getByRole("button", { name: "Decorar", exact: true }).click();
    await expect(painel.locator(".morada-edicao-saldo b")).toHaveText(saldo);
    await painel.getByRole("button", { name: /Na casa/ }).click();
    await novaMesa().click();
    await expect(painel.getByLabel("Orientação do móvel")).toHaveText("90°");
    await expect(painel.getByLabel("Largura (m)", { exact: true })).toHaveValue(String(posicao[0]));
    await expect(painel.getByLabel("Profundidade (m)", { exact: true })).toHaveValue(
      String(posicao[1]),
    );
    await painel.getByRole("button", { name: "Pintar", exact: true }).click();
    await expect(painel.getByLabel("Cor do móvel")).toHaveValue("#000000");
    await expect(
      painel.getByRole("button", { name: "Arte original", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await pessoa.page.getByRole("button", { name: "Vista superior", exact: true }).click();
    await painel.getByRole("button", { name: "Ver prévia na casa" }).click();
    await telaComDesenho(pessoa.page, `decoracao-${aparelho.nome}-restaurada-preto`);
    await medida(`decoracao-${aparelho.nome}-restaurada`, {
      aparelho: aparelho.nome,
      viewport: aparelho.viewport,
      posicao,
      giro: 90,
      pintura: "#000000",
      saldo,
      restauracao: true,
      fonte: "interface de producao; sem depuracao ou leitura de conteudo do banco",
    });
    await jogo.sair.click();
    await expect(pessoa.page).toHaveURL(/\/estante/);
  });
}

test("duas contas jogam a mesma família; uma cai, a outra continua, e tudo volta depois de derrubar a instância", async ({
  browser,
}) => {
  test.setTimeout(600_000);
  await iniciarServidor();
  expect(registros("instancia_registrada")).toHaveLength(1);

  // A Bia joga num navegador próprio, que mais adiante é morto sem aviso.
  const navegadorDaBia = await novoNavegadorDaBia();

  const ana = await novaPessoa(browser, "Ana");
  let bia = await novaPessoa(navegadorDaBia, "Bia");
  let mundoId = "";

  await test.step("1. Ana cria um mundo do Morada, convida, e Bia entra com o código", async () => {
    await ana.page.goto("/estante");
    await expect(ana.page.getByText("Para jogar, crie um mundo ou abra um dos seus")).toBeVisible();
    mundoId = await criarMundo(ana.page, "Morada", "Casa da Ana");
    // Na página do mundo o responsável já tem o caminho para o jogo.
    await expect(ana.page.getByRole("link", { name: "Jogar em Casa da Ana" })).toBeVisible();
    await convidar(ana.page, bia.page, mundoId);
    await expect(bia.page.getByRole("link", { name: "Jogar em Casa da Ana" })).toBeVisible();
  });

  const daAna = jogoEm(ana.page);
  let daBia = jogoEm(bia.page);
  const pedidosDeArte = new Map<string, number>();
  ana.page.on("response", (resposta) => {
    if (resposta.url().startsWith(`${origemDoJogo(JOGO).http}/arte/`))
      pedidosDeArte.set(new URL(resposta.url()).pathname, resposta.status());
  });

  await test.step("7a. a estante não baixa o jogo; a página do jogo baixa, com a política dela", async () => {
    const daEstante = await scriptsDe(ana.page, () => ana.page.goto("/estante"));
    expect(daEstante.length).toBeGreaterThan(3);
    expect(daEstante.filter((codigo) => codigo.includes(MARCA_DO_CLIENTE))).toEqual([]);
    expect(daEstante.filter((codigo) => codigo.includes(SINAL_DO_THREE))).toEqual([]);
    expect(daEstante.filter((codigo) => codigo.includes("morada-hud"))).toEqual([]);

    let politica = "";
    const doJogo = await scriptsDe(ana.page, async () => {
      // Pelo caminho que a pessoa faz: o "Jogar" do mundo, na estante.
      const [resposta] = await Promise.all([
        ana.page.waitForResponse((r) => r.request().resourceType() === "document"),
        ana.page.getByRole("link", { name: "Jogar em Casa da Ana" }).click(),
      ]);
      politica = resposta.headers()["content-security-policy"] ?? "";
      await mundoNaTela(daAna);
    });
    await expect(ana.page).toHaveURL(enderecoDoJogo(mundoId));
    expect(doJogo.some((codigo) => codigo.includes(MARCA_DO_CLIENTE))).toBe(true);
    expect(doJogo.some((codigo) => codigo.includes(SINAL_DO_THREE))).toBe(true);
    await expect(daAna.cena).toBeFocused();
    const origemDaArte = process.env.MORADA_ARTE_DIR ? ` ${origemDoJogo(JOGO).http} blob:` : "";
    expect(politica).toContain(`connect-src 'self' ${origemDoJogo(JOGO).ws}${origemDaArte};`);
    if (process.env.MORADA_ARTE_DIR) {
      // O teste normal continua sem arte; o opt-in local exercita SDK, CORS e CSP de verdade.
      await expect
        .poll(() => [...pedidosDeArte.keys()].filter((p) => p.includes("/obj-")).length)
        .toBe(41);
      await expect
        .poll(() => [...pedidosDeArte.keys()].filter((p) => p.includes("/tex-")).length)
        .toBe(11);
      expect([...pedidosDeArte.values()].every((status) => status === 200 || status === 304)).toBe(
        true,
      );
      await ana.page.getByRole("button", { name: "Paredes baixas", exact: true }).click();
      await expect
        .poll(() => [...pedidosDeArte.keys()].filter((p) => p.includes("/vao-")).length)
        .toBe(3);
      await tela(ana.page, "morada-arte-paredes-inteiras");
      await ana.page.getByRole("button", { name: "Paredes altas", exact: true }).click();
    }
    expect(politica).not.toContain("'unsafe-eval'");
    // Nada de quem joga está escrito no documento: nem o e-mail, nem um token.
    const documento = await ana.page.content();
    expect(documento).not.toContain(ana.email);
    expect(documento).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
  });

  await test.step("2a. as duas veem a mesma família, os quatro retratos e o mesmo relógio", async () => {
    await bia.page.goto(enderecoDoJogo(mundoId));
    await mundoNaTela(daBia);
    for (const jogo of [daAna, daBia]) {
      await expect(jogo.nomes).toHaveText(FAMILIA);
      await expect(jogo.retratos.and(jogo.page.locator("[data-estado='disponivel']"))).toHaveCount(
        4,
      );
      await expect(jogo.presenca.locator("b")).toHaveText("Família Ipê");
    }
    await expect(daAna.presenca).toContainText("Você e Bia");
    await expect(daBia.presenca).toContainText("Você e Ana");
    // O mesmo relógio do jogo nas duas janelas, com a folga de uma leitura depois da outra.
    const [relogioDaAna, relogioDaBia] = [await minutosDeJogo(daAna), await minutosDeJogo(daBia)];
    expect(Math.abs(relogioDaAna - relogioDaBia)).toBeLessThanOrEqual(2);
    expect(relogioDaAna).toBeGreaterThanOrEqual(8 * 60);

    // Quem criou o mundo responde por ele; quem foi convidada joga sem gerir o mundo nem as finanças.
    await expect(daAna.hud).toHaveAttribute("data-morada-papel", "steward");
    await expect(daAna.hud).toHaveAttribute(
      "data-morada-permissoes",
      TODAS_AS_PERMISSOES.join(" "),
    );
    await expect(daBia.hud).toHaveAttribute("data-morada-papel", "member");
    await expect(daBia.hud).toHaveAttribute(
      "data-morada-permissoes",
      TODAS_AS_PERMISSOES.filter((p) => p !== "gerir_mundo" && p !== "gerir_financas").join(" "),
    );
    // Do lado da instância: uma abertura, com a primeira cerca, e as duas entradas conferidas no Recreio.
    expect(registros("mundo_aberto")).toMatchObject([{ mundoId, cerca: 1, novo: true }]);
    expect(registros("jogador_entrou").map((r) => r.papel)).toEqual(["steward", "member"]);

    // Uma saída só: a do jogo. A página não desenha a dela por cima.
    await expect(daAna.sair).toBeVisible();
    await expect(daAna.sairDaPagina).toHaveCount(0);
    await tela(ana.page, "morada-entrada-ana");
  });

  await test.step("2b. cada uma dirige um morador; o retrato do outro diz quem dirige; tomar o que é da outra é recusado", async () => {
    await daAna.retrato("Lia").click();
    await expect(daAna.retrato("Lia")).toHaveAttribute("data-estado", "voce");
    await daBia.retrato("Marcos").click();
    await expect(daBia.retrato("Marcos")).toHaveAttribute("data-estado", "voce");

    await expect(daAna.retrato("Marcos")).toHaveAttribute("data-estado", "outro");
    await expect(daAna.retrato("Marcos")).toHaveAccessibleName(/Dirigido por Bia/);
    await expect(daAna.retrato("Marcos").locator(".morada-placa")).toHaveText("Bia");
    await expect(daBia.retrato("Lia")).toHaveAttribute("data-estado", "outro");
    await expect(daBia.retrato("Lia")).toHaveAccessibleName(/Dirigido por Ana/);

    await daBia.retrato("Lia").click();
    await expect(daBia.recusa).toContainText("Outra pessoa está dirigindo este morador.");
    await expect(daBia.retrato("Lia")).toHaveAttribute("data-estado", "outro");
    await expect(daBia.retrato("Marcos")).toHaveAttribute("data-estado", "voce");
    await expect(daAna.fila.locator("h2")).toHaveText("Fila de Lia");
    await tela(bia.page, "morada-recusa-bia");
  });

  let achados: AlvoNaCena[] = [];

  await test.step("2c. Ana manda a Lia a um ponto da casa, e Bia vê a Lia chegar lá", async () => {
    achados = await varrerCena(daAna);
    const partida = await localDe(daAna.retrato("Lia"));
    if (!partida) throw new Error("A Lia não está na casa");
    const longe = (alvo: AlvoNaCena) =>
      alvo.pos ? Math.hypot(alvo.pos[0] - partida[0], alvo.pos[1] - partida[1]) : 0;
    const candidatos = achados
      .filter((alvo) => alvo.tipo === "chao" && longe(alvo) >= 1500 && longe(alvo) <= 6000)
      .sort((a, b) => longe(a) - longe(b));
    expect(candidatos.length, "chão livre à vista na cena").toBeGreaterThan(0);

    let destino: [number, number] | null = null;
    for (const candidato of candidatos) {
      if (!(await clicarNaCena(daAna, candidato))) continue;
      // O pedido aparece na fila; se o ponto não for alcançável, o jogo diz e o teste tenta outro.
      const pedido = daAna.itensDaFila.filter({ hasText: "Ir até aqui" });
      const aceito = await expect(pedido)
        .toHaveCount(1, { timeout: 3000 })
        .then(
          () => true,
          () => false,
        );
      if (aceito) {
        destino = candidato.pos;
        break;
      }
    }
    if (!destino) throw new Error("Nenhum ponto do chão foi aceito");
    const lugar = destino.join(",");

    // Uma conversa em curso dura até 40 s de relógio antes de a caminhada começar.
    await expect(daAna.retrato("Lia")).toHaveAttribute("data-morada-local", lugar, {
      timeout: 120_000,
    });
    await expect(daBia.retrato("Lia")).toHaveAttribute("data-morada-local", lugar, {
      timeout: 20_000,
    });
    await expect(daBia.retrato("Lia")).not.toHaveAttribute("data-morada-andando", "sim");
    await tela(bia.page, "morada-chegou-bia");
  });

  await test.step("2d. o menu em leque de um móvel põe uma interação na fila", async () => {
    // A geladeira, se estiver à vista; senão, qualquer móvel que ofereça algo.
    const moveis = achados
      .filter((alvo) => alvo.tipo === "objeto")
      .sort((a, b) => Number(b.nome === "Geladeira") - Number(a.nome === "Geladeira"));
    expect(moveis.length, "móveis à vista na cena").toBeGreaterThan(0);
    let pedida = "";
    for (const movel of moveis) {
      if (!(await clicarNaCena(daAna, movel))) continue;
      const menu = ana.page.getByRole("menu", { name: movel.nome });
      await expect(menu.locator(".morada-menu-centro")).toContainText(movel.nome);
      const opcao = menu.locator("[role='menuitem']:not([aria-disabled='true'])").first();
      if ((await opcao.count()) === 0) {
        await ana.page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        continue;
      }
      pedida = (await opcao.locator("b").textContent()) ?? "";
      await tela(ana.page, "morada-menu-ana");
      await opcao.click();
      await expect(menu).toHaveCount(0);
      break;
    }
    expect(pedida, "uma interação oferecida por um móvel").not.toBe("");
    await expect(daAna.fila).toContainText(pedida);
    await expect(daAna.recusa).toHaveCount(0);
  });

  await test.step("resize: em uma janela menor a cena e o HUD se ajustam e continuam inteiros", async () => {
    await ana.page.setViewportSize({ width: 1000, height: 700 });
    await expect.poll(async () => (await daAna.cena.boundingBox())?.width).toBe(1000);
    for (const seletor of [
      ".morada-retratos",
      ".morada-fila",
      ".morada-relogio",
      ".morada-trilho",
    ]) {
      const caixa = await ana.page.locator(seletor).boundingBox();
      expect(caixa, seletor).not.toBeNull();
      if (!caixa) continue;
      expect(caixa.x).toBeGreaterThanOrEqual(0);
      expect(caixa.y).toBeGreaterThanOrEqual(0);
      expect(caixa.x + caixa.width).toBeLessThanOrEqual(1000);
      expect(caixa.y + caixa.height).toBeLessThanOrEqual(700);
    }
    await expect(daAna.retratos).toHaveCount(4);
    const uso = test.info().project.use.viewport ?? { width: 1365, height: 900 };
    await ana.page.setViewportSize(uso);
    await expect.poll(async () => (await daAna.cena.boundingBox())?.width).toBe(uso.width);
  });

  await test.step("4. o navegador da Bia morre sem aviso: Ana continua, vê a espera e depois assume o Marcos", async () => {
    const antes = await minutosDeJogo(daAna);
    esquecerAparelho(bia.contexto);
    await navegadorQueCai?.kill();
    navegadorQueCai = null;

    await expect(daAna.retrato("Marcos")).toHaveAttribute("data-espera", "sim", {
      timeout: 20_000,
    });
    await expect(daAna.retrato("Marcos")).toHaveAccessibleName(/Dirigido por Bia, em espera/);
    await expect(daAna.presenca).toContainText("Bia em espera");
    await tela(ana.page, "morada-bia-em-espera");

    // Ana continua jogando enquanto isso: ainda dirige a Lia e o relógio do mundo anda.
    await expect(daAna.retrato("Lia")).toHaveAttribute("data-estado", "voce");
    await expect.poll(() => minutosDeJogo(daAna), { timeout: 30_000 }).toBeGreaterThan(antes);

    // Passada a janela de espera (30 s), a Bia some e o Marcos fica livre.
    await expect(daAna.retrato("Marcos")).toHaveAttribute("data-estado", "disponivel", {
      timeout: 60_000,
    });
    await expect(daAna.presenca).toContainText("Só você no mundo");
    await daAna.retrato("Marcos").click();
    await expect(daAna.retrato("Marcos")).toHaveAttribute("data-estado", "voce");
    await expect(daAna.fila.locator("h2")).toHaveText("Fila de Marcos");
    // E volta para a Lia, que é quem ela vai marcar como preferida.
    await daAna.retrato("Lia").click();
    await expect(daAna.retrato("Lia")).toHaveAttribute("data-estado", "voce");
    await expect(daAna.retratos).toHaveCount(4);
  });

  let relogioAntes = 0;
  let fotografiaAntes: Record<string, unknown> | undefined;

  await test.step("3. antes da queda: uma fotografia do mundo e, depois dela, um fato que só está no diário", async () => {
    // O que o HUD mostra agora: é daqui que o relógio não pode voltar.
    relogioAntes = await minutosDeJogo(daAna);
    expect(relogioAntes).toBeGreaterThan(8 * 60);
    await expect(daAna.preferido).toHaveAttribute("aria-pressed", "false");
    // O relógio da tela anda um pouco à frente do servidor: deixa o mundo passar da hora anotada.
    await expect
      .poll(() => minutosDeJogo(daAna), { timeout: 30_000 })
      .toBeGreaterThan(relogioAntes + 1);

    // Espera a próxima fotografia periódica (a cada 30 s de mudança).
    const fotografias = registros("fotografia_gravada").length;
    await expect
      .poll(() => registros("fotografia_gravada").length, { timeout: 60_000 })
      .toBeGreaterThan(fotografias);
    fotografiaAntes = registros("fotografia_gravada").at(-1);

    // Logo depois dela, o fato crítico: a Lia vira a preferida da Ana. O botão só
    // muda quando o servidor responde, e ele só responde com o fato no diário.
    await daAna.preferido.click();
    await expect(daAna.preferido).toHaveAttribute("aria-pressed", "true");
    await expect(daAna.retrato("Lia")).toHaveAttribute("data-morada-preferido", "sim");
    await expect(daAna.recusa).toHaveCount(0);
    await tela(ana.page, "morada-antes-da-queda");
  });

  await test.step("5. a instância morre com SIGKILL; Ana vê a faixa do jogo, outra instância sobe e o mundo volta", async () => {
    await tolerando(ehFalhaDaQueda, async () => {
      await matarServidor();
      // A faixa do próprio jogo, com a casa ainda na tela: não é uma página de erro.
      await expect(daAna.faixa).toBeVisible({ timeout: 20_000 });
      await expect(daAna.hud).toHaveAttribute("data-morada-conexao", "reconectando");
      await expect(daAna.retratos).toHaveCount(4);
      await expect(ana.page.locator(".painel")).toHaveCount(0);
      await expect(ana.page.getByRole("link", { name: "Voltar à estante" })).toHaveCount(0);
      await tela(ana.page, "morada-reconectando");

      await iniciarServidor();
      // A posse da instância morta vale por até 30 s; só depois o Recreio a entrega à nova.
      await expect(daAna.hud).toHaveAttribute("data-morada-conexao", "pronto", {
        timeout: 120_000,
      });
    });
    await expect(daAna.faixa).toHaveCount(0);

    // O mesmo mundo: a mesma família, com o fato crítico de pé.
    await expect(ana.page).toHaveURL(enderecoDoJogo(mundoId));
    await expect(daAna.nomes).toHaveText(FAMILIA);
    await expect(daAna.presenca.locator("b")).toHaveText("Família Ipê");
    await expect(daAna.retrato("Lia")).toHaveAttribute("data-morada-preferido", "sim");
    // A reserva volta pela regra do jogo: quem entra já dirige o seu preferido, sem pedir de novo.
    await expect(daAna.retrato("Lia")).toHaveAttribute("data-estado", "voce");
    await expect(daAna.preferido).toHaveAttribute("aria-pressed", "true");
    await expect(daAna.fila.locator("h2")).toHaveText("Fila de Lia");
    await expect(daAna.retrato("Marcos")).toHaveAttribute("data-estado", "disponivel");
    // O relógio não voltou: está onde estava antes da fotografia, ou adiante.
    const relogioDepois = await minutosDeJogo(daAna);
    expect(relogioDepois).toBeGreaterThanOrEqual(relogioAntes);
    expect(relogioDepois).toBeGreaterThan(8 * 60);
    // E o jogo segue: o relógio anda e a Ana dá ordens.
    await expect
      .poll(() => minutosDeJogo(daAna), { timeout: 30_000 })
      .toBeGreaterThan(relogioDepois);
    await tela(ana.page, "morada-de-volta");

    // Do lado das instâncias: dois registros no Recreio, duas aberturas do mesmo
    // mundo com a cerca subindo, e a segunda montada da última fotografia mais
    // o fato que só estava no diário.
    expect(registros("instancia_registrada")).toHaveLength(2);
    const aberturas = registros("mundo_aberto").filter((registro) => registro.mundoId === mundoId);
    expect(aberturas.map((registro) => registro.cerca)).toEqual([1, 2]);
    expect(aberturas[1]).toMatchObject({ novo: false });
    expect(Number(aberturas[1]?.fatosReaplicados)).toBeGreaterThanOrEqual(1);
    // O mundo volta no tick do último fato do diário, que é depois da fotografia.
    expect(Number(aberturas[1]?.tick)).toBeGreaterThan(Number(fotografiaAntes?.tick));
    expect(Number(aberturas[1]?.revisao)).toBeGreaterThanOrEqual(Number(fotografiaAntes?.revisao));
    expect(Number(aberturas[1]?.diarioSeq)).toBeGreaterThan(Number(fotografiaAntes?.diarioSeq));
  });

  await test.step("6. Bia volta em outro navegador, entra de novo e está na mesma família com a Ana", async () => {
    bia = await entrarDeNovo(await novoNavegadorDaBia(), bia);
    daBia = jogoEm(bia.page);
    await bia.page.getByRole("link", { name: "Jogar em Casa da Ana" }).click();
    // O navegador que morreu não encerrou a sessão de jogo: o Recreio pergunta antes de continuar.
    await expect(
      bia.page.getByRole("heading", { name: "Você já está jogando em outro lugar" }),
    ).toBeVisible();
    await bia.page.getByRole("button", { name: "Continuar aqui" }).click();
    await mundoNaTela(daBia);

    await expect(daBia.nomes).toHaveText(FAMILIA);
    await expect(daBia.presenca).toContainText("Você e Ana");
    await expect(daAna.presenca).toContainText("Você e Bia");
    await expect(daBia.retrato("Lia")).toHaveAccessibleName(/Dirigido por Ana/);
    await expect(daBia.retrato("Lia")).toHaveAttribute("data-morada-preferido", "sim");
    await daBia.retrato("Marcos").click();
    await expect(daBia.retrato("Marcos")).toHaveAttribute("data-estado", "voce");
    await expect(daAna.retrato("Marcos")).toHaveAccessibleName(/Dirigido por Bia/);
    expect(
      Math.abs((await minutosDeJogo(daAna)) - (await minutosDeJogo(daBia))),
    ).toBeLessThanOrEqual(2);
    await tela(bia.page, "morada-bia-de-volta");
  });

  await test.step("sair pelo jogo volta à estante, e o mundo vazio é fotografado e solto", async () => {
    await daBia.sair.click();
    await expect(bia.page).toHaveURL(/\/estante$/);
    await daAna.sair.click();
    await expect(ana.page).toHaveURL(/\/estante$/);
    // O resumo do cartão vem da fotografia que a instância gravou ao esvaziar.
    await expect(async () => {
      await ana.page.reload();
      await expect(ana.page.getByText(/Família Ipê, Dia \d+ · 4 moradores/)).toBeVisible({
        timeout: 1_000,
      });
    }).toPass({ timeout: 30_000 });
    await expect.poll(() => registros("mundo_hibernou").length, { timeout: 30_000 }).toBe(1);
  });
});

test("o Morada sem instância e com a sessão trocada de janela: quem avisa é a página, uma vez", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const davi = await novaPessoa(browser, "Davi");
  const mundoId = await criarMundo(davi.page, "Morada", "Casa do Davi");
  const primeira = davi.page;
  const daPrimeira = jogoEm(primeira);

  await test.step("sem nenhuma instância, a página diz que o jogo está iniciando; com ela no ar, tentar de novo abre", async () => {
    await primeira.goto(enderecoDoJogo(mundoId));
    await expect(primeira.getByRole("heading", { name: "O jogo está iniciando" })).toBeVisible();
    // O aviso é o da página, sozinho: o jogo não deixou nada na tela.
    await expect(primeira.locator(".morada")).toHaveCount(0);
    await iniciarServidor();
    await primeira.getByRole("button", { name: "Tentar de novo" }).click();
    await mundoNaTela(daPrimeira);
    await daPrimeira.retrato("Lia").click();
    await expect(daPrimeira.retrato("Lia")).toHaveAttribute("data-estado", "voce");
  });

  await test.step("a mesma conta continua em outra aba: a primeira para, com o aviso da página e sem o do jogo", async () => {
    const segunda = await davi.contexto.newPage();
    const daSegunda = jogoEm(segunda);
    await segunda.goto(enderecoDoJogo(mundoId));
    await expect(
      segunda.getByRole("heading", { name: "Você já está jogando em outro lugar" }),
    ).toBeVisible();
    await segunda.getByRole("button", { name: "Continuar aqui" }).click();
    await mundoNaTela(daSegunda);

    await expect(
      primeira.getByRole("heading", { name: "Você continuou o jogo em outro lugar" }),
    ).toBeVisible({ timeout: 30_000 });
    // Um aviso só: o cartão de fim do jogo não aparece junto com o da página.
    await expect(primeira.locator(".morada")).toHaveCount(0);
    await expect(primeira.getByRole("alertdialog")).toHaveCount(0);
    await expect(primeira.getByRole("heading", { level: 2 })).toHaveCount(1);
    await tela(primeira, "morada-continuou-em-outro-lugar");
    // A segunda aba segue jogando, com a família inteira.
    await expect(daSegunda.nomes).toHaveText(FAMILIA);
    await daSegunda.retrato("Lia").click();
    await expect(daSegunda.retrato("Lia")).toHaveAttribute("data-estado", "voce");

    await test.step("sair da conta em uma aba encerra o jogo na outra, com o motivo que só o Recreio sabe", async () => {
      await primeira.goto("/conta");
      const sair = primeira.getByRole("button", { name: "Sair da conta" });
      await hidratado(sair);
      await sair.click();
      await expect(primeira).toHaveURL(/\/$/);
      // A instância fica sabendo no batimento seguinte (10 s) e fecha a conexão sem dizer por quê;
      // a página pergunta ao Recreio e mostra o motivo.
      await expect(segunda.getByRole("heading", { name: "Você saiu da conta" })).toBeVisible({
        timeout: 40_000,
      });
      await expect(segunda.locator(".morada")).toHaveCount(0);
      await expect(segunda.getByRole("heading", { level: 2 })).toHaveCount(1);
    });
  });
});

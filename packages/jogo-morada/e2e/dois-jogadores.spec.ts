import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
  chaoLivre,
  distanciaAte,
  entrar,
  esperarChegada,
  fotografar,
  idDoMorador,
  retrato,
} from "./apoio";

/**
 * Duas pessoas, em dois navegadores, na mesma família do mesmo mundo. Os
 * passos seguem na ordem, sobre o mesmo mundo: é uma história só.
 */

test.describe.configure({ mode: "serial" });

let contextoDaLia: BrowserContext;
let contextoDoBruno: BrowserContext;
let lia: Page;
let bruno: Page;
const erros: string[] = [];

function vigiar(pagina: Page, quem: string): void {
  pagina.on("pageerror", (erro) => erros.push(`${quem}: ${erro.message}`));
  pagina.on("console", (mensagem) => {
    if (mensagem.type() === "error") erros.push(`${quem}: ${mensagem.text()}`);
  });
}

test.beforeAll(async ({ browser }) => {
  contextoDaLia = await browser.newContext();
  contextoDoBruno = await browser.newContext();
  lia = await contextoDaLia.newPage();
  bruno = await contextoDoBruno.newPage();
  vigiar(lia, "Lia");
  vigiar(bruno, "Bruno");
});

test.afterAll(async () => {
  await contextoDaLia?.close();
  await contextoDoBruno?.close().catch(() => {});
});

test("1. as duas entram, veem os quatro retratos e o mesmo mundo", async () => {
  await entrar(lia, "Lia");
  await entrar(bruno, "Bruno");

  for (const pagina of [lia, bruno]) {
    await expect(pagina.locator(".morada-retrato")).toHaveCount(4);
    await expect(pagina.locator(".morada-retrato-nome")).toHaveText([
      "Lia",
      "Marcos",
      "Nina",
      "Vó Ana",
    ]);
    await expect(pagina.locator(".morada-retrato[data-estado='disponivel']")).toHaveCount(4);
    await expect(pagina.locator(".morada-presenca")).toContainText("Você e mais 1 pessoa");
  }

  const mundoDaLia = await lia.evaluate(() => window.__morada?.espelho()?.mundoId);
  const mundoDoBruno = await bruno.evaluate(() => window.__morada?.espelho()?.mundoId);
  expect(mundoDaLia).toBeTruthy();
  expect(mundoDoBruno).toBe(mundoDaLia);
  // Cada uma é uma pessoa diferente dentro do mundo.
  const jogadores = await Promise.all(
    [lia, bruno].map((pagina) => pagina.evaluate(() => window.__morada?.jogadorId())),
  );
  expect(jogadores[0]).toBeTruthy();
  expect(jogadores[1]).not.toBe(jogadores[0]);
  // E as duas veem os quatro moradores desenhados na cena.
  for (const pagina of [lia, bruno]) {
    const desenhados = await pagina.evaluate(
      () => Object.keys(window.__morada?.posicoes() ?? {}).length,
    );
    expect(desenhados).toBe(4);
  }
  // Cada morador é desenhado onde o espelho diz que ele está (quem está parado no lote).
  const desvios = await lia.evaluate(() => {
    const jogo = window.__morada;
    const visao = jogo?.espelho();
    const desenhados = jogo?.posicoes() ?? {};
    return (visao?.moradores.ordem ?? []).flatMap((id) => {
      const morador = visao?.moradores.porId[id];
      const desenhado = desenhados[id];
      if (!morador || !desenhado || morador.local.t !== "lote" || morador.movimento) return [];
      return [
        Math.hypot(
          desenhado.pos[0] - morador.local.pos[0],
          desenhado.pos[1] - morador.local.pos[1],
        ),
      ];
    });
  });
  expect(desvios.length).toBeGreaterThan(0);
  expect(Math.max(...desvios)).toBeLessThan(5);
  await fotografar(lia, "1-entrada-lia");
  await fotografar(bruno, "1-entrada-bruno");
});

test("2. cada uma dirige um morador; o retrato do outro diz quem dirige; tomar o que é do outro é recusado", async () => {
  await retrato(lia, "Lia").click();
  await expect(retrato(lia, "Lia")).toHaveAttribute("data-estado", "voce");
  await retrato(bruno, "Marcos").click();
  await expect(retrato(bruno, "Marcos")).toHaveAttribute("data-estado", "voce");

  // Cada uma vê o morador da outra como dirigido por outra pessoa.
  await expect(retrato(lia, "Marcos")).toHaveAttribute("data-estado", "outro");
  await expect(retrato(lia, "Marcos")).toHaveAccessibleName(/Dirigido por outra pessoa/);
  await expect(retrato(bruno, "Lia")).toHaveAttribute("data-estado", "outro");
  await expect(retrato(bruno, "Lia")).toHaveAccessibleName(/Dirigido por outra pessoa/);
  await expect(retrato(lia, "Nina")).toHaveAttribute("data-estado", "disponivel");

  // O Bruno tenta tomar a Lia: o servidor recusa e o jogo diz por quê.
  await retrato(bruno, "Lia").click();
  await expect(bruno.locator(".morada-aviso[data-tom='recusa']")).toContainText(
    "Outra pessoa está dirigindo este morador.",
  );
  await expect(retrato(bruno, "Lia")).toHaveAttribute("data-estado", "outro");
  await expect(retrato(bruno, "Marcos")).toHaveAttribute("data-estado", "voce");
  await expect(retrato(lia, "Lia")).toHaveAttribute("data-estado", "voce");
  await expect(lia.locator(".morada-fila h2")).toHaveText("Fila de Lia");
  await fotografar(lia, "2-dirigindo-lia");
  await fotografar(bruno, "2-recusa-bruno");
});

test("3. clicar no chão leva o morador até lá, e a outra pessoa vê chegar", async () => {
  const id = await idDoMorador(lia, "Lia");
  const destino = await chaoLivre(lia, id);
  const antes = await distanciaAte(lia, id, destino.pos);
  expect(antes).toBeGreaterThan(1000);

  await lia.mouse.click(destino.x, destino.y);
  // O pedido aparece na fila, e o servidor aceita.
  // Se a Lia estava dando atenção a alguém, o pedido espera a vez na fila.
  await expect(
    lia.locator(".morada-fila .morada-etiqueta").filter({ hasText: "Ir até aqui" }),
  ).toHaveCount(1);

  await esperarChegada(lia, id, destino.pos);
  await esperarChegada(bruno, id, destino.pos);
  // No espelho das duas, a Lia terminou no ponto exato do clique.
  for (const pagina of [lia, bruno]) {
    await pagina.waitForFunction(
      ({ morador, alvo }) => {
        const local = window.__morada?.espelho()?.moradores.porId[morador]?.local;
        return local?.t === "lote" && local.pos[0] === alvo[0] && local.pos[1] === alvo[1];
      },
      { morador: id, alvo: destino.pos },
      { timeout: 20_000 },
    );
  }
  await expect(lia.locator(".morada-aviso[data-tom='recusa']")).toHaveCount(0);
  await fotografar(lia, "3-chegou-lia");
  await fotografar(bruno, "3-chegou-bruno");
});

test("4. o menu em leque da geladeira manda fazer um lanche", async () => {
  const geladeira = await lia.evaluate(() => {
    const jogo = window.__morada;
    const visao = jogo?.espelho();
    const id = visao?.objetos.ordem.find((objeto) =>
      visao.objetos.porId[objeto]?.catalogo.startsWith("geladeira"),
    );
    const tela = id ? jogo?.telaDoObjeto(id) : null;
    const alvo = tela ? jogo?.oQueHa(tela.x, tela.y) : null;
    return { id, tela, alvo };
  });
  const geladeiraId = geladeira.id;
  if (!geladeiraId || !geladeira.tela) throw new Error("A geladeira não está na tela");
  expect(geladeira.alvo).toEqual({ t: "objeto", objetoId: geladeiraId });

  await lia.mouse.click(geladeira.tela.x, geladeira.tela.y);
  const menu = lia.getByRole("menu", { name: "Geladeira" });
  // O menu em si é só a âncora, sem tamanho: o que se vê é o centro e as opções.
  await expect(menu.locator(".morada-menu-centro")).toContainText("Geladeira");
  const lanche = menu.getByRole("menuitem", { name: "Fazer um lanche" });
  await expect(lanche).toBeVisible();
  await expect(lanche).not.toHaveAttribute("aria-disabled", "true");
  await fotografar(lia, "4-menu-da-geladeira");

  await lanche.click();
  await expect(menu).toHaveCount(0);
  await expect(lia.locator(".morada-fila")).toContainText("Fazer um lanche · Geladeira");

  // A Lia vai até a geladeira e come: a ação passa a `executando` no servidor.
  const id = await idDoMorador(lia, "Lia");
  await lia.waitForFunction(
    (morador) => {
      const visao = window.__morada?.espelho();
      const atual = visao?.moradores.porId[morador]?.acaoAtual;
      const acao = atual ? visao?.acoes.porId[atual] : undefined;
      return acao?.interacao === "comer" && acao.estado === "executando";
    },
    id,
    { timeout: 60_000 },
  );
  await expect(lia.locator(".morada-fila .morada-etiqueta").first()).toContainText("fazendo");
  // O Bruno vê a geladeira ocupada pela Lia.
  await bruno.waitForFunction((objeto) => {
    const ocupacao = window.__morada?.espelho()?.objetos.porId[objeto]?.ocupacao;
    return ocupacao !== undefined && Object.keys(ocupacao).length > 0;
  }, geladeiraId);
  await fotografar(lia, "4-comendo");
});

test("4b. a rede cai: o jogo reconecta sozinho, com a mesma sessão, e retoma a reserva", async () => {
  const id = await idDoMorador(lia, "Lia");
  const jogadorAntes = await lia.evaluate(() => window.__morada?.jogadorId());
  await lia.evaluate(() => window.__morada?.derrubarConexao());
  // O mundo fica na tela, com uma faixa dizendo o que está acontecendo.
  await expect(lia.locator(".morada-faixa")).toContainText("A conexão caiu");
  await expect(lia.locator(".morada-retrato")).toHaveCount(4);

  await lia.waitForFunction(() => window.__morada?.conexao() === "pronto", null, {
    timeout: 20_000,
  });
  await expect(lia.locator(".morada-faixa")).toHaveCount(0);
  // A mesma pessoa, dirigindo o mesmo morador, sem ter pedido de novo.
  expect(await lia.evaluate(() => window.__morada?.jogadorId())).toBe(jogadorAntes);
  expect(await lia.evaluate(() => window.__morada?.meuMoradorId())).toBe(id);
  await expect(retrato(lia, "Lia")).toHaveAttribute("data-estado", "voce");
  await expect(retrato(bruno, "Lia")).toHaveAttribute("data-estado", "outro");
  await expect(retrato(bruno, "Lia")).not.toHaveAttribute("data-espera", "sim");
  await expect(lia.locator(".morada-presenca")).toContainText("Você e mais 1 pessoa");
});

test("5. uma cai sem aviso: a outra continua, vê a espera, depois o morador livre, e assume", async () => {
  const tickAntes = await lia.evaluate(() => window.__morada?.tick() ?? 0);
  await contextoDoBruno.close();

  // A reserva do Bruno fica em espera: o retrato do Marcos diz isso.
  await expect(retrato(lia, "Marcos")).toHaveAttribute("data-espera", "sim");
  await expect(retrato(lia, "Marcos")).toHaveAccessibleName(/em espera/);
  await expect(lia.locator(".morada-presenca")).toContainText("1 em espera");
  await fotografar(lia, "5-em-espera");

  // A Lia continua jogando enquanto isso: o mundo anda e ela ainda dirige o morador dela.
  await expect(retrato(lia, "Lia")).toHaveAttribute("data-estado", "voce");
  await lia.waitForFunction((antes) => (window.__morada?.tick() ?? 0) > antes + 20, tickAntes);

  // Passada a janela de espera (30 s), o Bruno some e o Marcos fica livre.
  await expect(retrato(lia, "Marcos")).toHaveAttribute("data-estado", "disponivel", {
    timeout: 60_000,
  });
  await expect(lia.locator(".morada-presenca")).toContainText("Só você no mundo");

  // A Lia assume o Marcos; a família e o mundo estão inteiros.
  await retrato(lia, "Marcos").click();
  await expect(retrato(lia, "Marcos")).toHaveAttribute("data-estado", "voce");
  await expect(retrato(lia, "Lia")).toHaveAttribute("data-estado", "disponivel");
  await expect(lia.locator(".morada-retrato")).toHaveCount(4);
  await expect(lia.locator(".morada-fila h2")).toHaveText("Fila de Marcos");
  await fotografar(lia, "5-assumiu-o-marcos");
});

test("6. o contexto WebGL se perde e volta: aviso, cena refeita e jogo em sincronia", async () => {
  const id = await idDoMorador(lia, "Marcos");
  const quadrosAntes = await lia.evaluate(() => window.__morada?.medidas().quadros ?? 0);

  expect(await lia.evaluate(() => window.__morada?.perderContexto())).toBe(true);
  await expect(lia.getByText("A imagem do jogo parou")).toBeVisible();
  await fotografar(lia, "6-contexto-perdido");
  // A rede e o espelho não ficam sabendo: o mundo continua chegando.
  const tickPerdido = await lia.evaluate(() => window.__morada?.tick() ?? 0);
  await lia.waitForFunction((antes) => (window.__morada?.tick() ?? 0) > antes + 10, tickPerdido);
  expect(await lia.evaluate(() => window.__morada?.conexao())).toBe("pronto");

  expect(await lia.evaluate(() => window.__morada?.restaurarContexto())).toBe(true);
  await expect(lia.getByText("A imagem do jogo parou")).toHaveCount(0);
  // A cena voltou a desenhar, com todos os moradores.
  await lia.waitForFunction(
    (antes) => (window.__morada?.medidas().quadros ?? 0) > antes + 10,
    quadrosAntes,
  );
  await lia.waitForFunction(() => Object.keys(window.__morada?.posicoes() ?? {}).length === 4);
  expect(await lia.evaluate(() => window.__morada?.medidas().chamadas ?? 0)).toBeGreaterThan(5);

  // E o jogo segue: um clique no chão ainda leva o morador até lá.
  const destino = await chaoLivre(lia, id);
  await lia.mouse.click(destino.x, destino.y);
  await esperarChegada(lia, id, destino.pos);
  await fotografar(lia, "6-contexto-de-volta");
});

test("7. teclado: Espaço pede a pausa e a volta, Esc fecha o menu", async () => {
  await lia.locator("canvas.morada-tela").focus();
  const velocidade = () => lia.evaluate(() => window.__morada?.espelho()?.relogio.velocidade);
  expect(await velocidade()).toBe(1);

  // Sozinha no mundo, a pausa vale na hora.
  await lia.keyboard.press("Space");
  await expect.poll(velocidade).toBe(0);
  await expect(lia.getByRole("button", { name: "Pausar" })).toHaveAttribute("aria-pressed", "true");
  const parado = await lia.evaluate(() => window.__morada?.espelho()?.tick ?? 0);
  await lia.waitForTimeout(600);
  expect(await lia.evaluate(() => window.__morada?.espelho()?.tick ?? 0)).toBe(parado);
  await lia.keyboard.press("Space");
  await expect.poll(velocidade).toBe(1);

  // O menu de um morador abre no clique e fecha no Esc, devolvendo o foco à cena.
  const id = await idDoMorador(lia, "Vó Ana");
  const tela = await lia.evaluate((morador) => window.__morada?.telaDoMorador(morador), id);
  if (!tela) throw new Error("A Vó Ana não está na tela");
  await lia.mouse.click(tela.x, tela.y);
  await expect(lia.locator(".morada-menu-centro")).toContainText("Vó Ana");
  // A primeira opção que dá para escolher recebe o foco.
  await expect(lia.getByRole("menuitem").first()).toBeFocused();
  await lia.keyboard.press("Escape");
  await expect(lia.locator(".morada-menu")).toHaveCount(0);
  await expect(lia.locator("canvas.morada-tela")).toBeFocused();
});

test("8. em uma janela de 900 px o HUD continua inteiro e sem sobreposição", async () => {
  await lia.setViewportSize({ width: 900, height: 640 });
  await lia.waitForTimeout(300);
  const caixas = await lia.evaluate(() =>
    [
      ".morada-morador",
      ".morada-retratos",
      ".morada-fila",
      ".morada-relogio",
      ".morada-trilho",
    ].map((seletor) => {
      const caixa = document.querySelector(seletor)?.getBoundingClientRect();
      return caixa
        ? {
            seletor,
            esquerda: caixa.left,
            direita: caixa.right,
            topo: caixa.top,
            base: caixa.bottom,
          }
        : null;
    }),
  );
  for (const caixa of caixas) {
    expect(caixa).not.toBeNull();
    if (!caixa) continue;
    expect(caixa.esquerda).toBeGreaterThanOrEqual(0);
    expect(caixa.direita).toBeLessThanOrEqual(900);
    expect(caixa.topo).toBeGreaterThanOrEqual(0);
    expect(caixa.base).toBeLessThanOrEqual(640);
  }
  const [morador, retratos, fila] = caixas;
  if (!morador || !retratos || !fila) throw new Error("Falta um painel");
  expect(morador.direita).toBeLessThanOrEqual(retratos.esquerda);
  expect(retratos.direita).toBeLessThanOrEqual(fila.esquerda);
  await expect(lia.locator(".morada-retrato")).toHaveCount(4);
  await fotografar(lia, "8-janela-de-900");
  await lia.setViewportSize({ width: 1280, height: 720 });
});

test("9. sair avisa o servidor e devolve a página a quem hospeda o jogo", async () => {
  await lia.getByRole("button", { name: "Sair" }).click();
  // A bancada volta para o pedido de apelido; o jogo foi desmontado.
  await expect(lia.getByRole("heading", { name: "Morada" })).toBeVisible();
  await expect(lia.getByLabel("Apelido")).toBeVisible();
  await expect(lia.locator("canvas")).toHaveCount(0);
  expect(await lia.evaluate(() => window.__morada)).toBeUndefined();
});

test("10. entrar de novo pelo formulário; outra janela com o mesmo apelido toma o lugar desta", async ({
  browser,
}) => {
  await lia.getByLabel("Apelido").fill("Lia");
  await lia.getByRole("button", { name: "Entrar" }).click();
  await lia.waitForFunction(() => window.__morada?.conexao() === "pronto");
  // O mesmo mundo, com a mesma família: nada se perdeu com a saída.
  await expect(lia.locator(".morada-retrato")).toHaveCount(4);

  const outroContexto = await browser.newContext();
  const outraJanela = await outroContexto.newPage();
  await entrar(outraJanela, "Lia");

  // A primeira janela para, diz por quê e avisa quem hospeda o jogo.
  await expect(lia.getByRole("alertdialog")).toContainText("Você entrou por outra janela");
  await expect(lia.locator("html")).toHaveAttribute("data-morada-fim", "substituida");
  expect(await lia.evaluate(() => window.__morada?.conexao())).toBe("encerrado");
  await fotografar(lia, "10-outra-janela");
  // A janela nova segue jogando.
  expect(await outraJanela.evaluate(() => window.__morada?.conexao())).toBe("pronto");

  await lia.getByRole("button", { name: "Voltar" }).click();
  await expect(lia.getByLabel("Apelido")).toBeVisible();
  await outroContexto.close();
});

test("nenhum erro no console durante a história", () => {
  expect(erros).toEqual([]);
});

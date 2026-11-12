import { copiar, listar, type Morador, type Mundo, obter } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA, doCatalogo } from "@informach/morada-sim/conteudo";
import {
  criarMundoDaProva,
  criarRoteiro,
  LIA,
  moradorDeNome,
  type Roteiro,
} from "@informach/morada-sim/testes";
import { describe, expect, it } from "vitest";
import { estadoDoEspelho } from "../espelho/estado";
import { type Menu, menuDoAlvo, nomeDoObjeto, type OpcaoDoMenu } from "./menu";

/** O bairro da prova com um bebê de colo na família, filho da Lia. */
function bairroComBebe() {
  const bairro = copiar(BAIRRO_DA_PROVA);
  const familia = bairro.familias[0];
  if (!familia) throw new Error("O bairro da prova mudou");
  familia.moradores.push({
    ref: "teo",
    nome: "Téo",
    fase: "colo",
    linha: "m",
    pele: 11897418,
    cabelo: "curto_lateral",
    roupa: "infantil_macacao",
    tracos: [],
  });
  bairro.relacoes.push({ a: "lia", b: "teo", amizade: 800_000, parentesco: "genitor" });
  return bairro;
}

function objetoDe(mundo: Mundo, comportamento: string) {
  const objeto = listar(mundo.estado.objetos).find(
    (candidato) => doCatalogo(candidato.catalogo)?.comportamento === comportamento,
  );
  if (!objeto) throw new Error(`A casa da prova não tem ${comportamento}`);
  return objeto;
}

function opcao(menu: Menu | null, id: string): OpcaoDoMenu {
  const achada = menu?.opcoes.find((candidata) => candidata.id === id);
  if (!achada) throw new Error(`O menu não tem a opção ${id}`);
  return achada;
}

/** O menu como o cliente o monta: sobre o espelho da visão, não sobre o estado do servidor. */
function menuNoEspelho(
  mundo: Mundo,
  alvo: Parameters<typeof menuDoAlvo>[1],
  meu: Morador | null,
): Menu | null {
  const espelho = estadoDoEspelho(mundo.visao(LIA), mundo.estado.relogio.tick);
  return menuDoAlvo(espelho, alvo, { jogadorId: LIA, meuMoradorId: meu?.id ?? null });
}

function entrarEDirigir(roteiro: Roteiro, morador: Morador): string {
  const sessao = roteiro.entrar(LIA);
  expect(roteiro.comandar(sessao, morador.id, { t: "reservar" })).toMatchObject({ ok: true });
  return sessao;
}

describe("menu de um objeto", () => {
  it("a geladeira oferece o lanche a quem está com as mãos livres", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const lia = moradorDeNome(mundo, "Lia");
    entrarEDirigir(roteiro, lia);
    const geladeira = objetoDe(mundo, "geladeira");

    const menu = menuNoEspelho(mundo, { t: "objeto", objetoId: geladeira.id }, lia);
    expect(menu?.titulo).toBe("Geladeira");
    expect(menu?.opcoes).toEqual([
      {
        id: "comer",
        rotulo: "Fazer um lanche",
        habilitada: true,
        moradorId: lia.id,
        acao: {
          t: "interagir",
          interacao: "comer",
          alvo: { t: "objeto", objetoId: geladeira.id },
        },
      },
    ]);
    // O que o menu oferece o servidor aceita.
    const escolhida = opcao(menu, "comer");
    const sessao = mundo.presenca.sessoes[0]?.sessaoId ?? "";
    expect(roteiro.comandar(sessao, escolhida.moradorId, escolhida.acao)).toMatchObject({
      ok: true,
    });
  });

  it("sem morador escolhido, tudo aparece desligado com o que falta fazer", () => {
    const mundo = criarMundoDaProva();
    criarRoteiro(mundo).entrar(LIA);
    const menu = menuNoEspelho(mundo, { t: "objeto", objetoId: objetoDe(mundo, "fogao").id }, null);
    expect(menu?.opcoes).toHaveLength(1);
    expect(opcao(menu, "cozinhar")).toMatchObject({
      habilitada: false,
      motivo: "Escolha um morador pelo retrato primeiro.",
    });
  });

  it("com o bebê no colo, os móveis ficam desligados e o berço liga", () => {
    const mundo = criarMundoDaProva({ definicao: bairroComBebe() });
    const roteiro = criarRoteiro(mundo);
    const lia = moradorDeNome(mundo, "Lia");
    const teo = moradorDeNome(mundo, "Téo");
    const sessao = entrarEDirigir(roteiro, lia);
    const geladeira = { t: "objeto", objetoId: objetoDe(mundo, "geladeira").id } as const;
    const berco = { t: "objeto", objetoId: objetoDe(mundo, "berco").id } as const;

    // Antes de pegar o bebê: lanche ligado, berço desligado.
    expect(opcao(menuNoEspelho(mundo, geladeira, lia), "comer").habilitada).toBe(true);
    expect(opcao(menuNoEspelho(mundo, berco, lia), "por_no_berco")).toMatchObject({
      habilitada: false,
      motivo: "Só com um bebê no colo.",
    });

    expect(
      roteiro.comandar(sessao, lia.id, {
        t: "cuidar",
        bebeId: teo.id,
        cuidado: "pegar_no_colo",
        executorId: lia.id,
      }),
    ).toMatchObject({ ok: true });
    roteiro.ate(() => obter(mundo.estado.moradores, teo.id)?.local.t === "colo", 600, "o colo");

    const comBebe = opcao(menuNoEspelho(mundo, geladeira, lia), "comer");
    expect(comBebe).toMatchObject({
      habilitada: false,
      motivo: "Com o bebê no colo não dá. Acomode o bebê primeiro.",
    });
    // E o servidor concorda com o menu: o mesmo pedido é recusado.
    expect(roteiro.comandar(sessao, lia.id, comBebe.acao)).toMatchObject({
      ok: false,
      motivo: "requisito",
    });
    expect(opcao(menuNoEspelho(mundo, berco, lia), "por_no_berco").habilitada).toBe(true);
    // Consigo mesma, a Lia pode pôr o bebê no chão.
    const proprio = menuNoEspelho(mundo, { t: "morador", moradorId: lia.id }, lia);
    expect(opcao(proprio, "por_no_chao").habilitada).toBe(true);
  });

  it("um móvel com todos os lugares tomados diz que alguém já está usando", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const lia = moradorDeNome(mundo, "Lia");
    const marcos = moradorDeNome(mundo, "Marcos");
    const sessao = entrarEDirigir(roteiro, marcos);
    const geladeira = objetoDe(mundo, "geladeira");
    const alvo = { t: "objeto", objetoId: geladeira.id } as const;
    roteiro.comandar(sessao, marcos.id, { t: "interagir", interacao: "comer", alvo });
    roteiro.ate(
      () => Object.keys(obter(mundo.estado.objetos, geladeira.id)?.ocupacao ?? {}).length > 0,
      50,
      "a reserva da geladeira",
    );

    // Para a Lia, que a pessoa passa a dirigir, a geladeira está ocupada pelo Marcos.
    roteiro.comandar(sessao, lia.id, { t: "reservar" });
    expect(opcao(menuNoEspelho(mundo, alvo, lia), "comer")).toMatchObject({
      habilitada: false,
      motivo: "Alguém já está usando.",
    });
  });

  it("um móvel sem ação tem menu vazio, com nome", () => {
    const mundo = criarMundoDaProva();
    const lia = moradorDeNome(mundo, "Lia");
    const mesa = listar(mundo.estado.objetos).find((objeto) =>
      objeto.catalogo.startsWith("mesa_jantar"),
    );
    if (!mesa) throw new Error("sem mesa");
    const menu = menuNoEspelho(mundo, { t: "objeto", objetoId: mesa.id }, lia);
    expect(menu).toMatchObject({ titulo: "Mesa", opcoes: [], vazio: "Nada para fazer aqui." });
    expect(nomeDoObjeto("catalogo_que_nao_existe")).toBe("Objeto");
  });
});

describe("menu de um morador", () => {
  it("entre parentes não há flerte nem pedido de namoro, e o motivo aparece", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const lia = moradorDeNome(mundo, "Lia");
    const marcos = moradorDeNome(mundo, "Marcos");
    entrarEDirigir(roteiro, lia);

    const menu = menuNoEspelho(mundo, { t: "morador", moradorId: marcos.id }, lia);
    expect(menu?.titulo).toBe("Marcos");
    expect(opcao(menu, "conversar").habilitada).toBe(true);
    expect(opcao(menu, "flertar")).toMatchObject({ habilitada: false, motivo: "São parentes." });
    expect(opcao(menu, "propor_namoro")).toMatchObject({
      habilitada: false,
      motivo: "São parentes.",
      acao: { t: "propor", tipo: "namoro", alvoId: marcos.id },
    });
    // Cuidados de bebê e despedida de visita não fazem sentido com um adulto da casa.
    const ids = menu?.opcoes.map((o) => o.id) ?? [];
    expect(ids).not.toContain("dar_mamadeira");
    expect(ids).not.toContain("despedir");
    expect(ids).not.toContain("receber");
  });

  it("com quem não é parente, o flerte liga quando há amizade; o namoro vai pelo comando propor", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const marcos = moradorDeNome(mundo, "Marcos");
    const duda = moradorDeNome(mundo, "Duda");
    const sessao = entrarEDirigir(roteiro, marcos);

    // A Duda mora no bairro e ainda não está na casa: nada dá para fazer com ela.
    const longe = menuNoEspelho(mundo, { t: "morador", moradorId: duda.id }, marcos);
    expect(opcao(longe, "conversar")).toMatchObject({
      habilitada: false,
      motivo: "Não dá para chegar lá.",
    });

    expect(
      roteiro.comandar(sessao, marcos.id, { t: "convidar_visita", alvoId: duda.id }),
    ).toMatchObject({
      ok: true,
    });
    roteiro.ate(() => obter(mundo.estado.moradores, duda.id)?.local.t === "lote", 400, "a visita");

    const menu = menuNoEspelho(mundo, { t: "morador", moradorId: duda.id }, marcos);
    expect(opcao(menu, "conversar").habilitada).toBe(true);
    expect(opcao(menu, "flertar").habilitada).toBe(true);
    expect(opcao(menu, "despedir").habilitada).toBe(true);
    expect(opcao(menu, "beijar")).toMatchObject({
      habilitada: false,
      motivo: "Só entre um casal.",
    });
    expect(opcao(menu, "propor_casamento")).toMatchObject({
      habilitada: false,
      motivo: "Precisam estar namorando.",
    });
    const namoro = opcao(menu, "propor_namoro");
    expect(namoro).toMatchObject({ habilitada: true, acao: { t: "propor", tipo: "namoro" } });
    expect(roteiro.comandar(sessao, namoro.moradorId, namoro.acao)).toMatchObject({ ok: true });
  });

  it("uma criança não vê opções de adulto", () => {
    const mundo = criarMundoDaProva();
    const roteiro = criarRoteiro(mundo);
    const nina = moradorDeNome(mundo, "Nina");
    const lia = moradorDeNome(mundo, "Lia");
    entrarEDirigir(roteiro, nina);
    const ids =
      menuNoEspelho(mundo, { t: "morador", moradorId: lia.id }, nina)?.opcoes.map((o) => o.id) ??
      [];
    expect(ids).toEqual(["conversar", "abracar"]);
  });

  it("o retrato do bebê abre os cuidados, com quem executa", () => {
    const mundo = criarMundoDaProva({ definicao: bairroComBebe() });
    const roteiro = criarRoteiro(mundo);
    const lia = moradorDeNome(mundo, "Lia");
    const nina = moradorDeNome(mundo, "Nina");
    const teo = moradorDeNome(mundo, "Téo");
    const sessao = roteiro.entrar(LIA);

    // Sem dirigir ninguém: o pedido vai sem executor e a simulação escolhe um adulto.
    const semMorador = menuNoEspelho(mundo, { t: "cuidados", bebeId: teo.id }, null);
    expect(semMorador?.titulo).toBe("Cuidar de Téo");
    expect(semMorador?.opcoes.map((o) => o.id)).toEqual([
      "dar_mamadeira",
      "trocar_fralda",
      "ninar",
      "brincar_com_bebe",
      "pegar_no_colo",
      "por_para_dormir",
    ]);
    const mamadeira = opcao(semMorador, "dar_mamadeira");
    expect(mamadeira).toMatchObject({
      habilitada: true,
      moradorId: null,
      acao: { t: "cuidar", bebeId: teo.id, cuidado: "dar_mamadeira" },
    });
    expect(roteiro.comandar(sessao, mamadeira.moradorId, mamadeira.acao)).toMatchObject({
      ok: true,
    });

    // Dirigindo um adulto, é ele quem cuida.
    roteiro.comandar(sessao, lia.id, { t: "reservar" });
    expect(
      opcao(menuNoEspelho(mundo, { t: "cuidados", bebeId: teo.id }, lia), "ninar").acao,
    ).toEqual({
      t: "cuidar",
      bebeId: teo.id,
      cuidado: "ninar",
      executorId: lia.id,
    });
    // Dirigindo uma criança, o pedido volta a ir sem executor.
    roteiro.comandar(sessao, nina.id, { t: "reservar" });
    expect(
      opcao(menuNoEspelho(mundo, { t: "cuidados", bebeId: teo.id }, nina), "ninar").acao,
    ).toEqual({
      t: "cuidar",
      bebeId: teo.id,
      cuidado: "ninar",
    });
  });

  it("pôr para dormir liga e desliga pela conferência do servidor, com o mesmo motivo", () => {
    const mundo = criarMundoDaProva({ definicao: bairroComBebe() });
    const roteiro = criarRoteiro(mundo);
    const lia = moradorDeNome(mundo, "Lia");
    const marcos = moradorDeNome(mundo, "Marcos");
    const teo = moradorDeNome(mundo, "Téo");
    const sessao = entrarEDirigir(roteiro, lia);
    const cuidados = { t: "cuidados", bebeId: teo.id } as const;
    const dormir = (ator: Morador | null) =>
      opcao(menuNoEspelho(mundo, cuidados, ator), "por_para_dormir");
    /** O que o servidor responde ao pedido que o menu faria. */
    const pedir = (ator: Morador | null) =>
      roteiro.comandar(sessao, dormir(ator).moradorId, dormir(ator).acao);

    // O Marcos pega o Téo no colo: para a Lia, o bebê está no colo de outra pessoa.
    roteiro.comandar(sessao, marcos.id, { t: "reservar" });
    roteiro.comandar(sessao, marcos.id, {
      t: "cuidar",
      bebeId: teo.id,
      cuidado: "pegar_no_colo",
      executorId: marcos.id,
    });
    roteiro.ate(() => teo.local.t === "colo", 600, "o colo");
    roteiro.comandar(sessao, lia.id, { t: "reservar" });
    expect(dormir(lia)).toMatchObject({
      habilitada: false,
      motivo: "O bebê está no colo de outra pessoa.",
    });
    expect(pedir(lia)).toMatchObject({
      ok: false,
      motivo: "requisito",
      detalhe: "no_colo_de_outro",
    });

    // Sem dirigir ninguém, o pedido vai sem executor: o menu liga, e quem carrega o bebê o leva.
    roteiro.comandar(sessao, lia.id, { t: "liberar" });
    expect(dormir(null)).toMatchObject({ habilitada: true, moradorId: null });
    expect(pedir(null)).toMatchObject({ ok: true });
    roteiro.ate(() => teo.local.t === "objeto", 1500, "o Téo chegar ao berço");

    // No berço, o menu diz por que não, com ou sem cuidador, e o servidor recusa pelo mesmo motivo.
    roteiro.comandar(sessao, lia.id, { t: "reservar" });
    for (const ator of [lia, null]) {
      expect(dormir(ator)).toMatchObject({ habilitada: false, motivo: "O bebê já está no berço." });
      expect(pedir(ator)).toMatchObject({ ok: false, motivo: "requisito", detalhe: "ja_no_berco" });
    }
  });

  it("o alvo que sumiu do mundo não tem menu", () => {
    const mundo = criarMundoDaProva();
    expect(menuNoEspelho(mundo, { t: "objeto", objetoId: "obj_999999" }, null)).toBeNull();
    expect(menuNoEspelho(mundo, { t: "morador", moradorId: "mor_999999" }, null)).toBeNull();
  });
});

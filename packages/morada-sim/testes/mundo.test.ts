import { describe, expect, it } from "vitest";
import { BAIRRO_DA_PROVA, CONTEUDO, doCatalogo, validarConteudo } from "../src/conteudo";
import { criarMundo, listar, objetosDoLote, verificarInvariantes } from "../src/index";
import { criarMundoDaProva, moradorDeNome } from "../src/testes";

describe("conteúdo da prova", () => {
  it("não tem referência quebrada", () => {
    expect(validarConteudo()).toEqual([]);
  });

  it("toda peça da casa está no catálogo", () => {
    const mundo = criarMundoDaProva();
    for (const objeto of listar(mundo.estado.objetos)) {
      expect(doCatalogo(objeto.catalogo), objeto.catalogo).toBeDefined();
    }
  });

  it("nenhuma peça de pacote entra na prova", () => {
    for (const entrada of CONTEUDO.catalogo) expect(entrada.id).not.toMatch(/_pacote$/);
  });
});

describe("mundo da prova", () => {
  it("é um bairro com dois lotes, um com a casa pronta e um vazio", () => {
    const mundo = criarMundoDaProva();
    const lotes = listar(mundo.estado.lotes);
    expect(lotes).toHaveLength(2);
    expect(lotes[0]?.imovelId).not.toBeNull();
    expect(lotes[0]?.familiaId).not.toBeNull();
    expect(lotes[1]).toMatchObject({ imovelId: null, familiaId: null });
    expect(listar(mundo.estado.imoveis)).toHaveLength(1);
    expect(BAIRRO_DA_PROVA.lotes).toHaveLength(2);
  });

  it("começa com uma família de quatro e dois avulsos fora dos lotes", () => {
    const mundo = criarMundoDaProva();
    const moradores = listar(mundo.estado.moradores);
    const familia = listar(mundo.estado.familias)[0];
    expect(moradores.filter((m) => m.familiaId === familia?.id).map((m) => m.nome)).toEqual([
      "Lia",
      "Marcos",
      "Nina",
      "Vó Ana",
    ]);
    const avulsos = moradores.filter((m) => m.familiaId === null);
    expect(avulsos.map((m) => m.nome)).toEqual(["Duda", "Caio"]);
    expect(avulsos.every((m) => m.local.t === "fora")).toBe(true);
    expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
  });

  it("não tem nada que diga quem é NPC", () => {
    const mundo = criarMundoDaProva();
    for (const morador of listar(mundo.estado.moradores)) {
      expect(Object.keys(morador).join(",")).not.toMatch(/npc|jogador|controlad/i);
    }
  });

  it("guarda as relações que o bairro descreve, uma por par", () => {
    const mundo = criarMundoDaProva();
    const lia = moradorDeNome(mundo, "Lia");
    const nina = moradorDeNome(mundo, "Nina");
    const relacao = listar(mundo.estado.relacoes).find(
      (r) => [r.a, r.b].includes(lia.id) && [r.a, r.b].includes(nina.id),
    );
    expect(relacao?.parentesco).toEqual({ tipo: "genitor", de: lia.id });
    expect(lia.relacoes).toContain(relacao?.id);
    expect(nina.relacoes).toContain(relacao?.id);
  });

  it("dá a quem funda todos os direitos sobre a família", () => {
    const mundo = criarMundoDaProva({ fundadores: ["p1", "p2"] });
    expect(mundo.estado.acessos.map((a) => a.perfilId)).toEqual(["p1", "p2"]);
    expect(mundo.estado.acessos[0]?.permissoes).toHaveLength(12);
  });

  it("recusa um bairro com referência quebrada", () => {
    const quebrado = structuredClone(BAIRRO_DA_PROVA);
    quebrado.relacoes.push({ a: "lia", b: "ninguem" });
    expect(() =>
      criarMundo({ mundoId: "m", semente: 1, definicao: quebrado, fundadores: [] }),
    ).toThrow(/desconhecido/);
  });
});

describe("casa da prova", () => {
  it("todo ponto de uso é alcançável a partir da entrada do lote", () => {
    const mundo = criarMundoDaProva();
    const lote = listar(mundo.estado.lotes)[0];
    if (!lote) throw new Error("sem lote");
    const navegador = mundo.navegador(lote.id);
    const inalcancaveis: string[] = [];
    for (const objeto of objetosDoLote(mundo.estado, lote.id)) {
      for (const ponto of doCatalogo(objeto.catalogo)?.pontos ?? []) {
        const acesso = navegador.acesso(objeto, ponto.id);
        if (!acesso || !navegador.rota(lote.entrada, acesso.pos)) {
          inalcancaveis.push(`${objeto.catalogo}/${ponto.id}`);
        }
      }
    }
    expect(inalcancaveis).toEqual([]);
  });

  it("tem cama para os quatro e berço para o bebê", () => {
    const mundo = criarMundoDaProva();
    const vagas = listar(mundo.estado.objetos).flatMap((objeto) =>
      (doCatalogo(objeto.catalogo)?.pontos ?? []).filter((ponto) => ponto.tipo === "deitar"),
    );
    expect(vagas.length).toBeGreaterThanOrEqual(4);
  });

  it("tem o que uma família precisa para viver", () => {
    const mundo = criarMundoDaProva();
    const comportamentos = new Set(
      listar(mundo.estado.objetos).map((o) => doCatalogo(o.catalogo)?.comportamento),
    );
    for (const preciso of [
      "cama_casal",
      "beliche",
      "berco",
      "geladeira",
      "fogao",
      "vaso",
      "chuveiro",
      "sofa",
    ]) {
      expect(comportamentos, preciso).toContain(preciso);
    }
  });
});

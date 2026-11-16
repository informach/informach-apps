import { describe, expect, it } from "vitest";
import { BAIRRO_INICIAL } from "../conteudo";
import { CONTADOR_DE_REVISOES_DOS_OBJETOS } from "../dominio/revisao-dos-objetos";
import { criarMundo, listar, restaurar, verificarInvariantes } from "../index";
import { criarMundoDaProva } from "../testes";
import { abrirFotografia } from "./fotografia";

describe("fotografia V2 para mundo V3", () => {
  it("admite loja inicial e revisões sem mudar dados da família ou do mundo de origem", () => {
    const atual = criarMundoDaProva().fotografar();
    const { loja, edicoes, historicoDaCasa, ...legado } = atual.estado;
    const contadoresAntigos = { ...legado.contadores };
    delete contadoresAntigos[CONTADOR_DE_REVISOES_DOS_OBJETOS];
    expect(loja.ofertas).toHaveLength(8);
    expect(edicoes).toEqual([]);
    expect(historicoDaCasa).toEqual([]);
    const antiga = {
      ...atual,
      estado: {
        ...legado,
        versao: 2,
        contadores: contadoresAntigos,
        objetos: {
          ordem: legado.objetos.ordem,
          porId: Object.fromEntries(
            listar(legado.objetos).map(({ revisao, ...objeto }) => {
              expect(revisao).toBe(1);
              return [objeto.id, objeto];
            }),
          ),
        },
      },
    };
    const antes = JSON.stringify(antiga);
    const recuperado = restaurar(antiga);
    expect(recuperado.fotografar()).toEqual(atual);
    expect(JSON.stringify(antiga)).toBe(antes);
    expect(verificarInvariantes(recuperado.estado)).toEqual([]);
  });

  it("preserva uma fundação personalizada e o recibo emitido antes da migração", () => {
    const mundo = criarMundo({
      mundoId: "fundacao-legada",
      semente: 42,
      definicao: BAIRRO_INICIAL,
      fundadores: [],
    });
    mundo.aplicar({
      t: "sessao_entrou",
      sessaoId: "adulto",
      perfilId: "adulto",
      podeFundarFamilia: true,
    });
    expect(
      mundo.aplicar({
        t: "intencao",
        sessaoId: "adulto",
        intencao: {
          mundoId: mundo.estado.id,
          comandoId: "fundacao-original",
          moradorId: null,
          versaoEsperada: 0,
          acao: {
            t: "fundar_familia",
            rascunho: {
              nome: "Família Ipê",
              moradores: [
                {
                  nome: "Joana",
                  fase: "adulto",
                  linha: "f",
                  pele: 0xc68058,
                  cabelo: "coque_alto",
                  roupa: "casual_vestido",
                  tracos: ["carinhoso"],
                },
              ],
              relacoes: [],
            },
          },
        },
      }).ok,
    ).toBe(true);
    const atual = mundo.fotografar();
    const { loja, edicoes, historicoDaCasa, ...legado } = atual.estado;
    expect(loja.ofertas).toHaveLength(8);
    expect(edicoes).toEqual([]);
    expect(historicoDaCasa).toEqual([]);
    const antiga = { ...atual, estado: { ...legado, versao: 2 } };
    const recuperado = restaurar(antiga);
    expect(recuperado.estado.fundacao).toEqual(atual.estado.fundacao);
    expect(recuperado.estado.moradores).toEqual(atual.estado.moradores);
    expect(recuperado.estado.familias).toEqual(atual.estado.familias);
  });

  it("V3 exige loja, registros e revisões válidos; não adivinha um formato futuro", () => {
    const atual = criarMundoDaProva().fotografar();
    for (const campos of [
      { loja: null },
      { edicoes: null },
      { historicoDaCasa: null },
      { contadores: {} },
      { contadores: { [CONTADOR_DE_REVISOES_DOS_OBJETOS]: 0 } },
      { contadores: { [CONTADOR_DE_REVISOES_DOS_OBJETOS]: Number.MAX_SAFE_INTEGER + 1 } },
      { objetos: { ...atual.estado.objetos, porId: { obj_000001: { revisao: 0 } } } },
      { versao: 4 },
    ])
      expect(() => abrirFotografia({ ...atual, estado: { ...atual.estado, ...campos } })).toThrow();
  });
});

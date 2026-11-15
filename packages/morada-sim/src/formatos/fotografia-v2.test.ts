import { describe, expect, it } from "vitest";
import { restaurar, verificarInvariantes } from "../index";
import { criarMundoDaProva, LIA } from "../testes";
import { abrirFotografia, VERSAO_DO_MUNDO } from "./fotografia";

describe("fotografia V1 para mundo V2", () => {
  it("acrescenta o recibo vazio sem reiniciar moradores, saldos, relações ou contadores", () => {
    const mundo = criarMundoDaProva();
    mundo.aplicar({ t: "sessao_entrou", sessaoId: "sessao-legada", perfilId: LIA });
    mundo.avancar(1_000);
    const atual = mundo.fotografar();
    const { fundacao, ...estadoLegado } = atual.estado;
    expect(fundacao).toBeNull();
    const antiga = { ...atual, estado: { ...estadoLegado, versao: 1 } };
    const bytesAntes = JSON.stringify(antiga);
    const aberta = abrirFotografia(antiga);
    expect(aberta.estado).toEqual({ ...antiga.estado, versao: VERSAO_DO_MUNDO, fundacao: null });
    expect(JSON.stringify(antiga)).toBe(bytesAntes);
    const recuperado = restaurar(antiga);
    expect(recuperado.fotografar()).toEqual(atual);
    expect(verificarInvariantes(recuperado.estado)).toEqual([]);
  });

  it("não aceita V2 sem o campo do recibo nem com recibo malformado", () => {
    const atual = criarMundoDaProva().fotografar();
    const { fundacao, ...semRecibo } = atual.estado;
    expect(fundacao).toBeNull();
    expect(() => abrirFotografia({ ...atual, estado: semRecibo })).toThrow(/Recibo/);
    expect(() =>
      abrirFotografia({ ...atual, estado: { ...atual.estado, fundacao: { autor: "alguem" } } }),
    ).toThrow(/Recibo/);
  });
});

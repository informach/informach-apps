import type { EdicaoDoCliente } from "@informach/morada-sim";
import { describe, expect, it } from "vitest";
import { atualizarEdicaoDoCliente } from "./edicao";

const edicao = (revisao: number, proximaSequencia: number | null): EdicaoDoCliente => ({
  proximaSequencia,
  historico: { revisao, desfazer: null, refazer: null },
});
describe("metadados individuais da edição", () => {
  it("ACK antigo preserva o histórico novo e não recua a sequência", () => {
    const atual = edicao(10, 8);
    expect(atualizarEdicaoDoCliente(atual, { proximaSequencia: 3 })).toEqual(atual);
    expect(atualizarEdicaoDoCliente(atual, edicao(7, 5))).toEqual(atual);
    expect(atual).toEqual(edicao(10, 8));
  });
  it("mesma revisão aceita a projeção atual após mudar a permissão", () => {
    const atual = edicao(10, 8),
      recebida = edicao(10, 8);
    expect(atualizarEdicaoDoCliente(atual, recebida).historico).toBe(recebida.historico);
    const nova = edicao(11, 9);
    expect(atualizarEdicaoDoCliente(atual, nova)).toEqual(nova);
  });
  it("esgotamento da sequência é terminal e host antigo continua sem histórico", () => {
    expect(atualizarEdicaoDoCliente(edicao(10, null), edicao(11, 4)).proximaSequencia).toBeNull();
    expect(
      atualizarEdicaoDoCliente(edicao(10, 4), { proximaSequencia: null }).proximaSequencia,
    ).toBeNull();
    expect(atualizarEdicaoDoCliente(undefined, { proximaSequencia: 1 })).toEqual({
      proximaSequencia: 1,
    });
  });
});

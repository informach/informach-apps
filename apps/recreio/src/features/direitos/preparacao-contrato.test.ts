import { describe, expect, it } from "vitest";
import {
  PedidoDePreparacaoDeDireitosSchema as Pedido,
  PlanoDeDireitosSchema as Plano,
} from "./preparacao-contrato";

const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
describe("direitos: escopo explícito e canônico da prévia", () => {
  it("conta sem jogador admite somente encerramento de escopo vazio", () => {
    expect(Pedido.safeParse({ tipo: "encerrar_conta", perfis: [] }).success).toBe(true);
    expect(Pedido.safeParse({ tipo: "retirar_perfil", perfis: [] }).success).toBe(false);
    expect(Pedido.safeParse({ tipo: "retirar_perfil", perfis: [a, b] }).success).toBe(false);
  });
  it("recusa perfis repetidos, desordenados, excesso e autoridade fornecida pelo cliente", () => {
    for (const perfis of [[a, a], [b, a], Array.from({ length: 257 }, () => a)])
      expect(Pedido.safeParse({ tipo: "encerrar_conta", perfis }).success).toBe(false);
    expect(
      Pedido.safeParse({ tipo: "retirar_perfil", perfis: [a], contaId: "outra" }).success,
    ).toBe(false);
  });
  it("plano não mistura adulto próprio com concessão parental e não oculta identidade global", () => {
    const plano = {
      formato: "recreio-previa-direitos-v1",
      tipo: "retirar_perfil",
      contaId: "conta",
      perfis: [{ id: a, tipo: "adult", versao: 1, responsabilidadeId: null }],
      mundos: [],
      identidadeGlobalPreservada: true,
      financeiroSeparado: true,
    };
    expect(Plano.safeParse(plano).success).toBe(true);
    expect(
      Plano.safeParse({ ...plano, perfis: [{ ...plano.perfis[0], responsabilidadeId: b }] })
        .success,
    ).toBe(false);
    expect(
      Plano.safeParse({ ...plano, perfis: [{ ...plano.perfis[0], tipo: "minor" }] }).success,
    ).toBe(false);
    expect(Plano.safeParse({ ...plano, identidadeGlobalPreservada: false }).success).toBe(false);
  });
});

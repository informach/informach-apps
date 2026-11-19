import { describe, expect, it } from "vitest";
import {
  AceiteDoEncerramentoSchema,
  FinanceiroDoEncerramentoSchema,
} from "./encerramento-contrato";
import { mesmoEscopoDeDireitos } from "./escopo";
import { resumoDoRegistro } from "./livro/assinatura";
import { lerPlanoExterno, serializarPlanoExterno } from "./livro/plano-externo";
import {
  apresentarPlanoDeDireitos,
  PlanoDeDireitosSchema,
  PlanoDeDireitosV1Schema,
  PlanoDeEncerramentoSchema,
} from "./preparacao-contrato";

const primeiro = "00000000-0000-4000-8000-000000000001";
const segundo = "00000000-0000-4000-8000-000000000002";
function financeiro() {
  return FinanceiroDoEncerramentoSchema.parse({
    formato: "recreio-encerramento-financeiro-v1",
    modo: "prod",
    efeito: "cancelar-renovacoes-e-checkouts-pendentes",
    periodosPagosPreservados: true,
    registrosFinanceirosPreservados: true,
    contratosDeOutrosAdultosPreservados: true,
    clientes: [{ id: primeiro, referenciaStripe: "cus_fixture123" }],
    comprasNaoEnviadas: [primeiro],
    trocasNaoEnviadas: [],
  });
}
function plano() {
  return PlanoDeEncerramentoSchema.parse({
    formato: "recreio-previa-encerramento-v2",
    tipo: "encerrar_conta",
    contaId: "conta",
    perfis: [],
    mundos: [],
    identidadeGlobalPreservada: true,
    revisaoDaParticipacao: 0,
    financeiro: financeiro(),
  });
}

describe("encerramento: plano financeiro versionado, ainda sem execução", () => {
  it("mantém os bytes canônicos legados e não interpreta a prévia v1 como aceite financeiro", () => {
    const legado =
      '{"formato":"recreio-previa-direitos-v1","tipo":"encerrar_conta","contaId":"conta","perfis":[],"mundos":[],"identidadeGlobalPreservada":true,"financeiroSeparado":true}';
    const anterior = PlanoDeDireitosV1Schema.parse(JSON.parse(legado));
    expect(JSON.stringify(PlanoDeDireitosSchema.parse(anterior))).toBe(legado);
    const bytes = Buffer.from(legado),
      sha = resumoDoRegistro(bytes);
    expect(serializarPlanoExterno(anterior, sha)).toEqual(bytes);
    expect(lerPlanoExterno(bytes, sha)).toEqual(anterior);
    expect(PlanoDeEncerramentoSchema.safeParse(anterior).success).toBe(false);
    expect(mesmoEscopoDeDireitos(anterior, plano())).toBe(false);
    expect(apresentarPlanoDeDireitos(anterior)).toEqual(anterior);
  });

  it("confere o plano privado completo, preserva SHA e omite referências do provedor na interface", () => {
    const p = plano(),
      bytes = Buffer.from(JSON.stringify(p)),
      sha = resumoDoRegistro(bytes);
    expect(lerPlanoExterno(bytes, sha)).toEqual(p);
    expect(serializarPlanoExterno(p, sha)).toEqual(bytes);
    const apresentado = apresentarPlanoDeDireitos(p);
    expect(apresentado).toMatchObject({
      financeiro: { clientes: 1, comprasNaoEnviadas: 1, trocasNaoEnviadas: 0 },
    });
    expect(JSON.stringify(apresentado)).not.toContain("cus_fixture123");
    expect(JSON.stringify(apresentado)).not.toContain('"referenciaStripe"');
    expect(JSON.stringify(apresentado)).not.toContain(primeiro);
    const alterado = Buffer.from(
      JSON.stringify({ ...p, financeiro: { ...p.financeiro, modo: "dev" } }),
    );
    expect(() => lerPlanoExterno(alterado, sha)).toThrow("recreio.rights_ledger.INTEGRIDADE");
  });

  it.each(["modo", "cliente", "compra", "troca", "participacao"] as const)(
    "mudança de %s exige nova preparação",
    (campo) => {
      const a = plano(),
        b = plano();
      if (campo === "modo") b.financeiro.modo = "dev";
      if (campo === "cliente") b.financeiro.clientes = [];
      if (campo === "compra") b.financeiro.comprasNaoEnviadas = [];
      if (campo === "troca") b.financeiro.trocasNaoEnviadas = [segundo];
      if (campo === "participacao") b.revisaoDaParticipacao = 1;
      expect(mesmoEscopoDeDireitos(a, b)).toBe(false);
    },
  );

  it("recusa perda de períodos pagos, alcance de outros adultos, metadata livre e listas não canônicas", () => {
    const f = financeiro();
    for (const invalido of [
      { ...f, periodosPagosPreservados: false },
      { ...f, registrosFinanceirosPreservados: false },
      { ...f, contratosDeOutrosAdultosPreservados: false },
      { ...f, metadata: { email: "terceiro@example.test" } },
      { ...f, clientes: [...f.clientes, { id: segundo, referenciaStripe: "cus_outro123" }] },
      { ...f, comprasNaoEnviadas: [primeiro, primeiro] },
      { ...f, comprasNaoEnviadas: [segundo, primeiro] },
      { ...f, trocasNaoEnviadas: Array.from({ length: 257 }, () => primeiro) },
    ])
      expect(FinanceiroDoEncerramentoSchema.safeParse(invalido).success).toBe(false);
    expect(
      PlanoDeEncerramentoSchema.safeParse({ ...plano(), tipo: "retirar_perfil" }).success,
    ).toBe(false);
    expect(
      PlanoDeEncerramentoSchema.safeParse({ ...plano(), revisaoDaParticipacao: 2 }).success,
    ).toBe(false);
  });

  it("exige os três aceites e recusa identidade/referências financeiras no pedido do navegador", () => {
    const aceite = {
      preparacaoId: primeiro,
      planoSha256: "a".repeat(64),
      confirmoEncerramento: true,
      confirmoRetiradaDosPerfis: true,
      confirmoCancelamentoDaRenovacao: true,
    };
    expect(AceiteDoEncerramentoSchema.safeParse(aceite).success).toBe(true);
    for (const campo of [
      "confirmoEncerramento",
      "confirmoRetiradaDosPerfis",
      "confirmoCancelamentoDaRenovacao",
    ])
      expect(AceiteDoEncerramentoSchema.safeParse({ ...aceite, [campo]: false }).success).toBe(
        false,
      );
    for (const extra of [
      { contaId: "outra" },
      { referenciaStripe: "cus_outro123" },
      { financeiro: financeiro() },
    ])
      expect(AceiteDoEncerramentoSchema.safeParse({ ...aceite, ...extra }).success).toBe(false);
  });
});

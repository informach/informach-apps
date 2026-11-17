import { describe, expect, it } from "vitest";
import { type Concessao, decidirPlanoDoGrupo, type FatosDoPlano, STATUS_PENDENTES } from "./acesso";

const agora = new Date("2026-11-17T12:00:00Z");
const fim = new Date("2026-11-18T12:00:00Z");
const cortesia: Concessao = {
  id: "cortesia",
  kind: "courtesy",
  tier: "family",
  inicio: new Date("2026-11-16T12:00:00Z"),
  fim,
  revogadaEm: null,
};
const base: FatosDoPlano = { agora, assinatura: null, teveAssinatura: false, concessoes: [] };

describe("plano do grupo sem perfil fictício do pagante", () => {
  it("não cria acesso nem limite quando o grupo não tem plano", () => {
    expect(decidirPlanoDoGrupo(base)).toEqual({
      estado: "SEM_ACESSO",
      podeJogar: false,
      motivo: "sem_plano",
      origem: null,
      origemId: null,
      limiteDePerfis: 0,
      validoAte: null,
    });
  });

  it.each([
    ["individual", 1],
    ["family", 4],
  ] as const)("%s informa %i vagas sem exigir jogador", (tier, limiteDePerfis) => {
    expect(decidirPlanoDoGrupo({ ...base, concessoes: [{ ...cortesia, tier }] })).toMatchObject({
      podeJogar: true,
      limiteDePerfis,
      origemId: cortesia.id,
      validoAte: fim,
    });
  });

  it("assinatura vigente precede cortesia e preserva o fim conhecido", () => {
    expect(
      decidirPlanoDoGrupo({
        ...base,
        assinatura: { id: "sub", status: "active", tier: "individual", cancelaEm: fim },
        concessoes: [cortesia],
      }),
    ).toMatchObject({
      estado: "CANCELAMENTO_AGENDADO",
      limiteDePerfis: 1,
      origem: "assinatura",
      origemId: "sub",
      validoAte: fim,
    });
  });

  it.each(STATUS_PENDENTES)("%s não concede vaga sem outra origem vigente", (status) => {
    const assinatura = { id: "sub", status, tier: "family" as const, cancelaEm: null };
    expect(decidirPlanoDoGrupo({ ...base, assinatura })).toMatchObject({
      podeJogar: false,
      estado: "PAGAMENTO_PENDENTE",
      limiteDePerfis: 0,
    });
    expect(decidirPlanoDoGrupo({ ...base, assinatura, concessoes: [cortesia] })).toMatchObject({
      podeJogar: true,
      limiteDePerfis: 4,
      origem: "concessao",
    });
  });

  it.each([
    ["vencida", { ...cortesia, fim: agora }, "ENCERRADO"],
    ["revogada", { ...cortesia, revogadaEm: agora }, "REVOGADO"],
    ["teste vencido", { ...cortesia, kind: "trial", fim: agora }, "TESTE_ENCERRADO"],
  ] as const)("%s tem limite zero", (_nome, concessao, estado) => {
    expect(decidirPlanoDoGrupo({ ...base, concessoes: [concessao] })).toMatchObject({
      estado,
      podeJogar: false,
      limiteDePerfis: 0,
    });
  });
});

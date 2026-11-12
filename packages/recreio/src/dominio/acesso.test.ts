import { describe, expect, it } from "vitest";
import {
  type Concessao,
  decidirAcesso,
  type FatosDeAcesso,
  STATUS_PENDENTES,
  STATUS_QUE_JOGAM,
  type StatusDaAssinatura,
} from "./acesso";
import type { GrupoId, PerfilId } from "./ids";

const agora = new Date("2026-11-11T12:00:00Z");
const dia = 24 * 60 * 60 * 1000;
const em = (dias: number) => new Date(agora.getTime() + dias * dia);

function fatos(mudancas: Partial<FatosDeAcesso> = {}): FatosDeAcesso {
  return {
    agora,
    perfil: {
      id: "11111111-1111-4111-8111-111111111111" as PerfilId,
      status: "active",
      grupoId: "22222222-2222-4222-8222-222222222222" as GrupoId,
      coberto: true,
      versaoDaPolitica: 3,
    },
    assinatura: null,
    teveAssinatura: false,
    concessoes: [],
    ...mudancas,
  };
}

function concessao(mudancas: Partial<Concessao> = {}): Concessao {
  return {
    id: "c1",
    kind: "courtesy",
    tier: "family",
    inicio: em(-1),
    fim: em(29),
    revogadaEm: null,
    ...mudancas,
  };
}

const assinatura = (status: StatusDaAssinatura, cancelaEm: Date | null = null) => ({
  id: "sub_1",
  status,
  tier: "individual" as const,
  cancelaEm,
});

describe("decidirAcesso", () => {
  it("sem plano nem concessão não joga", () => {
    const decisao = decidirAcesso(fatos());
    expect(decisao).toMatchObject({
      estado: "SEM_ACESSO",
      podeJogar: false,
      motivo: "sem_plano",
      limiteDePerfis: 0,
      versaoDaPolitica: 3,
    });
  });

  it.each(STATUS_QUE_JOGAM)("assinatura %s joga", (status) => {
    const decisao = decidirAcesso(fatos({ assinatura: assinatura(status) }));
    expect(decisao).toMatchObject({
      estado: "ATIVO",
      podeJogar: true,
      origem: "assinatura",
      origemId: "sub_1",
      limiteDePerfis: 1,
      validoAte: null,
    });
  });

  it.each(STATUS_PENDENTES)("assinatura %s nunca joga", (status) => {
    const decisao = decidirAcesso(fatos({ assinatura: assinatura(status), teveAssinatura: true }));
    expect(decisao).toMatchObject({ estado: "PAGAMENTO_PENDENTE", podeJogar: false });
  });

  it("cancelamento agendado joga até a data e a sessão não passa dela", () => {
    const decisao = decidirAcesso(fatos({ assinatura: assinatura("active", em(5)) }));
    expect(decisao.estado).toBe("CANCELAMENTO_AGENDADO");
    expect(decisao.podeJogar).toBe(true);
    expect(decisao.validoAte).toEqual(em(5));
  });

  it("cortesia vigente dá acesso ativo com o limite do tier", () => {
    const decisao = decidirAcesso(fatos({ concessoes: [concessao()] }));
    expect(decisao).toMatchObject({
      estado: "ATIVO",
      podeJogar: true,
      origem: "concessao",
      origemId: "c1",
      limiteDePerfis: 4,
    });
    expect(decisao.validoAte).toEqual(em(29));
  });

  it("teste vigente é TESTE", () => {
    const decisao = decidirAcesso(
      fatos({ concessoes: [concessao({ kind: "trial", tier: "family" })] }),
    );
    expect(decisao).toMatchObject({ estado: "TESTE", podeJogar: true });
  });

  it("a concessão vale do início, inclusive, ao fim, exclusive", () => {
    const noInicio = decidirAcesso(fatos({ concessoes: [concessao({ inicio: agora })] }));
    const noFim = decidirAcesso(fatos({ concessoes: [concessao({ fim: agora })] }));
    const antes = decidirAcesso(fatos({ concessoes: [concessao({ inicio: em(1), fim: em(2) })] }));
    expect(noInicio.podeJogar).toBe(true);
    expect(noFim.podeJogar).toBe(false);
    expect(antes.podeJogar).toBe(false);
  });

  it("assinatura que joga vence concessão", () => {
    const decisao = decidirAcesso(
      fatos({ assinatura: assinatura("active"), concessoes: [concessao()] }),
    );
    expect(decisao.origem).toBe("assinatura");
  });

  it("cortesia vigente cobre cobrança pendente", () => {
    const decisao = decidirAcesso(
      fatos({ assinatura: assinatura("past_due"), concessoes: [concessao()] }),
    );
    expect(decisao).toMatchObject({ estado: "ATIVO", origem: "concessao" });
  });

  it("entre concessões vigentes, cortesia vem antes de teste e a mais longa ganha", () => {
    const decisao = decidirAcesso(
      fatos({
        concessoes: [
          concessao({ id: "teste", kind: "trial", fim: em(60) }),
          concessao({ id: "curta", fim: em(3) }),
          concessao({ id: "longa", fim: em(10) }),
        ],
      }),
    );
    expect(decisao.origemId).toBe("longa");
  });

  it("concessão revogada não joga e a mais recente revogada marca REVOGADO", () => {
    const decisao = decidirAcesso(fatos({ concessoes: [concessao({ revogadaEm: em(-0.5) })] }));
    expect(decisao).toMatchObject({
      estado: "REVOGADO",
      podeJogar: false,
      motivo: "concessao_revogada",
    });
  });

  it("teste vencido sem assinatura é TESTE_ENCERRADO", () => {
    const decisao = decidirAcesso(
      fatos({ concessoes: [concessao({ kind: "trial", inicio: em(-9), fim: em(-2) })] }),
    );
    expect(decisao).toMatchObject({ estado: "TESTE_ENCERRADO", podeJogar: false });
  });

  it("cortesia vencida é ENCERRADO", () => {
    const decisao = decidirAcesso(
      fatos({ concessoes: [concessao({ inicio: em(-40), fim: em(-10) })] }),
    );
    expect(decisao).toMatchObject({ estado: "ENCERRADO", motivo: "concessao_encerrada" });
  });

  it("quem já assinou e não assina mais é ENCERRADO", () => {
    const decisao = decidirAcesso(
      fatos({ assinatura: assinatura("canceled"), teveAssinatura: true }),
    );
    expect(decisao).toMatchObject({ estado: "ENCERRADO", motivo: "assinatura_encerrada" });
  });

  it("perfil suspenso não joga nem com assinatura", () => {
    const base = fatos({ assinatura: assinatura("active") });
    const decisao = decidirAcesso({ ...base, perfil: { ...base.perfil, status: "suspended" } });
    expect(decisao).toMatchObject({ estado: "SUSPENSO", podeJogar: false });
  });

  it("perfil fora do grupo ou sem cobertura não joga", () => {
    const base = fatos({ assinatura: assinatura("active") });
    const semGrupo = decidirAcesso({ ...base, perfil: { ...base.perfil, grupoId: null } });
    const semCobertura = decidirAcesso({ ...base, perfil: { ...base.perfil, coberto: false } });
    expect(semGrupo).toMatchObject({ estado: "SEM_ACESSO", motivo: "perfil_sem_cobertura" });
    expect(semCobertura).toMatchObject({ estado: "SEM_ACESSO", podeJogar: false });
  });
});

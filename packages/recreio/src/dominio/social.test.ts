import { describe, expect, it } from "vitest";
import { ContaIdSchema, PerfilIdSchema } from "./ids";
import { calcularPoliticaDoMenor, supervisaoInicial } from "./politicas";
import {
  type AprovacaoSocial,
  amizadeDisponivel,
  aprovacaoSocialAtual,
  decidirPedidoDeAmizade,
  type PerfilSocial,
  presencaSocialVisivel,
  type RelacaoSocial,
} from "./social";

const a: PerfilSocial = {
  id: PerfilIdSchema.parse("11111111-1111-4111-8111-111111111111"),
  ativo: true,
  tipo: "adulto",
};
const b: PerfilSocial = {
  id: PerfilIdSchema.parse("22222222-2222-4222-8222-222222222222"),
  ativo: true,
  tipo: "adulto",
};
function protegido(ano: number): Extract<PerfilSocial, { tipo: "protegido" }> {
  return {
    id: PerfilIdSchema.parse("33333333-3333-4333-8333-333333333333"),
    ativo: true,
    tipo: "protegido",
    reconhecida: true,
    politica: calcularPoliticaDoMenor({ ano, mes: 1 }, { ano: 2026, mes: 11 }, supervisaoInicial()),
    responsabilidade: {
      contaId: ContaIdSchema.parse("44444444-4444-4444-8444-444444444444"),
      vinculoId: "vinculo-atual",
      geracao: "geracao-atual",
    },
  };
}
const relacao: RelacaoSocial = {
  bloqueadoPorUmaDasPartes: false,
  amizadeAceita: true,
  aprovacaoDaOrigem: null,
  aprovacaoDoDestino: null,
};
const aprovar = (p: Extract<PerfilSocial, { tipo: "protegido" }>): AprovacaoSocial => ({
  perfilId: p.id,
  ...p.responsabilidade,
});

describe("social privado independente do jogo", () => {
  it("adultos precisam de código e aceite, sem depender de plano ou mundo", () => {
    expect(
      decidirPedidoDeAmizade({
        origem: a,
        destino: b,
        codigoVigente: true,
        bloqueadoPorUmaDasPartes: false,
      }),
    ).toEqual({
      permitido: true,
      aprovarOrigem: false,
      aprovarDestino: false,
      avisarResponsavelDaOrigem: false,
      avisarResponsavelDoDestino: false,
    });
    expect(amizadeDisponivel(a, b, { ...relacao, amizadeAceita: false })).toBe(false);
    expect(amizadeDisponivel(a, b, relacao)).toBe(true);
  });
  it.each([2018, 2014])("até 12 anos (%i) exige aprovação atual em qualquer ponta", (ano) => {
    const menor = protegido(ano);
    expect(
      decidirPedidoDeAmizade({
        origem: a,
        destino: menor,
        codigoVigente: true,
        bloqueadoPorUmaDasPartes: false,
      }),
    ).toMatchObject({ permitido: true, aprovarDestino: true, avisarResponsavelDoDestino: true });
    expect(amizadeDisponivel(a, menor, relacao)).toBe(false);
    expect(amizadeDisponivel(a, menor, { ...relacao, aprovacaoDoDestino: aprovar(menor) })).toBe(
      true,
    );
    expect(amizadeDisponivel(menor, a, relacao)).toBe(false);
    expect(amizadeDisponivel(menor, a, { ...relacao, aprovacaoDaOrigem: aprovar(menor) })).toBe(
      true,
    );
  });
  it("adolescente usa código com aviso ao responsável; não recebe privilégio adulto", () => {
    const adolescente = protegido(2012);
    expect(
      decidirPedidoDeAmizade({
        origem: a,
        destino: adolescente,
        codigoVigente: true,
        bloqueadoPorUmaDasPartes: false,
      }),
    ).toMatchObject({ permitido: true, aprovarDestino: false, avisarResponsavelDoDestino: true });
    expect(
      presencaSocialVisivel({
        observador: a,
        observado: adolescente,
        relacao: { ...relacao, amizadeAceita: false },
        preferenciaDoAdulto: "online",
        membrosDoMesmoMundo: true,
      }),
    ).toBe(false);
  });
  it("trocar responsável, vínculo ou geração torna o aceite antigo insuficiente", () => {
    const menor = protegido(2018);
    const recibo = aprovar(menor);
    for (const alteracao of [
      { contaId: ContaIdSchema.parse("55555555-5555-4555-8555-555555555555") },
      { vinculoId: "outro-vinculo" },
      { geracao: "outra-geracao" },
    ]) {
      const atual = { ...menor, responsabilidade: { ...menor.responsabilidade, ...alteracao } };
      expect(aprovacaoSocialAtual(atual, recibo)).toBe(false);
      expect(amizadeDisponivel(a, atual, { ...relacao, aprovacaoDoDestino: recibo })).toBe(false);
    }
  });
  it("suspensão, contatos desativados, supervisão não reconhecida ou bloqueio prevalecem", () => {
    const menor = protegido(2018);
    const aprovadas = { ...relacao, aprovacaoDoDestino: aprovar(menor) };
    for (const atual of [
      { ...menor, ativo: false },
      { ...menor, reconhecida: false },
      { ...menor, politica: { ...menor.politica, contatos: "disabled" as const } },
    ]) {
      expect(amizadeDisponivel(a, atual, aprovadas)).toBe(false);
      expect(
        decidirPedidoDeAmizade({
          origem: a,
          destino: atual,
          codigoVigente: true,
          bloqueadoPorUmaDasPartes: false,
        }).permitido,
      ).toBe(false);
    }
    expect(amizadeDisponivel(a, menor, { ...aprovadas, bloqueadoPorUmaDasPartes: true })).toBe(
      false,
    );
    expect(
      decidirPedidoDeAmizade({
        origem: a,
        destino: b,
        codigoVigente: false,
        bloqueadoPorUmaDasPartes: false,
      }).permitido,
    ).toBe(false);
    expect(
      decidirPedidoDeAmizade({
        origem: a,
        destino: a,
        codigoVigente: true,
        bloqueadoPorUmaDasPartes: false,
      }).permitido,
    ).toBe(false);
  });
  it("invisível nunca mostra presença; mundo comum não substitui amizade de menor", () => {
    const menor = protegido(2018);
    const fatos = {
      observador: a,
      observado: menor,
      relacao: { ...relacao, aprovacaoDoDestino: aprovar(menor) },
      preferenciaDoAdulto: "online" as const,
      membrosDoMesmoMundo: true,
    };
    expect(presencaSocialVisivel(fatos)).toBe(true);
    expect(
      presencaSocialVisivel({
        ...fatos,
        observado: { ...menor, politica: { ...menor.politica, presenca: "invisible" } },
      }),
    ).toBe(false);
    expect(
      presencaSocialVisivel({ ...fatos, relacao: { ...fatos.relacao, amizadeAceita: false } }),
    ).toBe(false);
    expect(
      presencaSocialVisivel({ ...fatos, observado: b, preferenciaDoAdulto: "invisible" }),
    ).toBe(false);
  });
  it("adulto opta por presença no mundo conhecido; grupo comercial não é autorização", () => {
    const fatos = {
      observador: a,
      observado: b,
      relacao: { ...relacao, amizadeAceita: false },
      preferenciaDoAdulto: "online" as const,
      membrosDoMesmoMundo: true,
    };
    expect(presencaSocialVisivel(fatos)).toBe(true);
    expect(presencaSocialVisivel({ ...fatos, membrosDoMesmoMundo: false })).toBe(false);
    expect(presencaSocialVisivel({ ...fatos, preferenciaDoAdulto: "friends" })).toBe(false);
    expect(
      presencaSocialVisivel({
        ...fatos,
        relacao: { ...fatos.relacao, bloqueadoPorUmaDasPartes: true },
      }),
    ).toBe(false);
  });
});

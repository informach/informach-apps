import { type Concessao, GrupoIdSchema, type PerfilId, PerfilIdSchema } from "@informach/recreio";
import { describe, expect, it } from "vitest";
import { decidirComCobertura, type FatosSemCobertura, tierDoProduto } from "./cobertura";

const agora = new Date("2026-11-11T12:00:00Z");
const dias = (n: number) => new Date(agora.getTime() + n * 86_400_000);
const grupoId = GrupoIdSchema.parse("7b0c2a51-3d0e-4b7e-9a55-1f6f0c1d2e30");
const perfil = (n: number): PerfilId =>
  PerfilIdSchema.parse(`00000000-0000-4000-8000-00000000000${n}`);

const cortesia = (tier: "individual" | "family", extra: Partial<Concessao> = {}): Concessao => ({
  id: "c1",
  kind: "courtesy",
  tier,
  inicio: dias(-1),
  fim: dias(29),
  revogadaEm: null,
  ...extra,
});

function fatos(id: PerfilId, extra: Partial<FatosSemCobertura> = {}): FatosSemCobertura {
  return {
    agora,
    perfil: { id, status: "active", grupoId, versaoDaPolitica: 1 },
    assinatura: null,
    teveAssinatura: false,
    concessoes: [],
    ...extra,
  };
}

describe("cobertura pelo plano em vigor", () => {
  const cinco = [1, 2, 3, 4, 5].map(perfil);

  it("o plano individual cobre só o primeiro perfil coberto do grupo", () => {
    const concessoes = [cortesia("individual")];
    const cobertura = { ligada: true, cobertosDoGrupo: cinco };
    expect(decidirComCobertura(fatos(perfil(1), { concessoes }), cobertura)).toMatchObject({
      estado: "ATIVO",
      podeJogar: true,
      limiteDePerfis: 1,
    });
    expect(decidirComCobertura(fatos(perfil(2), { concessoes }), cobertura)).toMatchObject({
      estado: "SEM_ACESSO",
      podeJogar: false,
      motivo: "perfil_sem_cobertura",
    });
  });

  it("o plano família cobre os quatro primeiros e deixa o quinto de fora", () => {
    const concessoes = [cortesia("family")];
    const cobertura = { ligada: true, cobertosDoGrupo: cinco };
    for (const n of [1, 2, 3, 4])
      expect(decidirComCobertura(fatos(perfil(n), { concessoes }), cobertura)).toMatchObject({
        podeJogar: true,
        limiteDePerfis: 4,
      });
    expect(decidirComCobertura(fatos(perfil(5), { concessoes }), cobertura)).toMatchObject({
      podeJogar: false,
      motivo: "perfil_sem_cobertura",
    });
  });

  it("a assinatura ativa define o limite, mesmo com uma cortesia maior", () => {
    const decisao = decidirComCobertura(
      fatos(perfil(2), {
        assinatura: { id: "s1", status: "active", tier: "individual", cancelaEm: null },
        teveAssinatura: true,
        concessoes: [cortesia("family")],
      }),
      { ligada: true, cobertosDoGrupo: cinco },
    );
    expect(decisao).toMatchObject({ podeJogar: false, motivo: "perfil_sem_cobertura" });
  });

  it("perfil com a cobertura desligada, fora da lista ou sem grupo não joga", () => {
    const concessoes = [cortesia("family")];
    expect(
      decidirComCobertura(fatos(perfil(1), { concessoes }), {
        ligada: false,
        cobertosDoGrupo: cinco,
      }),
    ).toMatchObject({ estado: "SEM_ACESSO", motivo: "perfil_sem_cobertura" });
    expect(
      decidirComCobertura(fatos(perfil(9), { concessoes }), {
        ligada: true,
        cobertosDoGrupo: cinco,
      }),
    ).toMatchObject({ estado: "SEM_ACESSO", motivo: "perfil_sem_cobertura" });
    const semGrupo = fatos(perfil(1), { concessoes });
    expect(
      decidirComCobertura(
        { ...semGrupo, perfil: { ...semGrupo.perfil, grupoId: null } },
        { ligada: true, cobertosDoGrupo: [] },
      ),
    ).toMatchObject({ estado: "SEM_ACESSO", motivo: "perfil_sem_cobertura" });
  });

  it("sem plano em vigor, a resposta explica o porquê em vez de culpar a cobertura", () => {
    const cobertura = { ligada: true, cobertosDoGrupo: cinco };
    expect(
      decidirComCobertura(
        fatos(perfil(1), { concessoes: [cortesia("family", { revogadaEm: dias(-0.5) })] }),
        cobertura,
      ),
    ).toMatchObject({ estado: "REVOGADO", podeJogar: false });
    expect(
      decidirComCobertura(
        fatos(perfil(1), {
          concessoes: [cortesia("family", { inicio: dias(-40), fim: dias(-10) })],
        }),
        cobertura,
      ),
    ).toMatchObject({ estado: "ENCERRADO", podeJogar: false });
    expect(decidirComCobertura(fatos(perfil(1)), cobertura)).toMatchObject({
      estado: "SEM_ACESSO",
      motivo: "sem_plano",
    });
  });

  it("perfil suspenso continua suspenso, com ou sem plano", () => {
    const base = fatos(perfil(1), { concessoes: [cortesia("family")] });
    expect(
      decidirComCobertura(
        { ...base, perfil: { ...base.perfil, status: "suspended" } },
        { ligada: true, cobertosDoGrupo: cinco },
      ),
    ).toMatchObject({ estado: "SUSPENSO", podeJogar: false });
  });
});

describe("tier do produto", () => {
  it("só reconhece os planos do Recreio", () => {
    expect(tierDoProduto("individual")).toBe("individual");
    expect(tierDoProduto("family")).toBe("family");
    expect(tierDoProduto("pro")).toBeNull();
    expect(tierDoProduto(undefined)).toBeNull();
  });
});

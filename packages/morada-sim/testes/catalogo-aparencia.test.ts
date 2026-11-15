import { describe, expect, it } from "vitest";
import { BAIRRO_INICIAL, corpoDaFase } from "../src/conteudo";
import {
  type CatalogoDeAparencias,
  CatalogoDeAparenciasSchema,
  conferirContinuidadeDaAparencia,
  criarMundo,
  FASES,
  listar,
  type Mundo,
  type RascunhoDaFamilia,
  RascunhoDaFamiliaSchema,
  REGRAS_PADRAO,
  type RegrasDoMundo,
  restaurar,
  verificarInvariantes,
} from "../src/index";

function catalogo(): CatalogoDeAparencias {
  return CatalogoDeAparenciasSchema.parse({
    formato: "morada.aparencias",
    versao: 1,
    opcoes: FASES.flatMap((fase) =>
      ["f", "m"].map((linha) => ({
        id: `ensaio_${fase}_${linha}`,
        fase,
        linha,
        corpo: corpoDaFase(linha === "f" ? "f" : "m", fase),
        cabelo: "natural",
        roupa: "macacao",
        rotuloDoCabelo: "Natural",
        rotuloDaRoupa: "Macacão",
        peleInicial: 0xa07050,
        edicaoInicial: { versao: 1, corDoCabelo: 0x302010, coresDaRoupa: { inteira: 0x3588cc } },
      })),
    ),
  });
}
function novo(c: CatalogoDeAparencias = catalogo(), regras?: Partial<RegrasDoMundo>): Mundo {
  return criarMundo(
    {
      mundoId: "catalogo",
      semente: 31,
      definicao: BAIRRO_INICIAL,
      fundadores: [],
      catalogoDeAparencias: c,
      regras,
    },
    { conferirReplicacao: true },
  );
}
function familia(): RascunhoDaFamilia {
  return RascunhoDaFamiliaSchema.parse({
    nome: "Nova",
    moradores: [
      {
        nome: "Lua",
        fase: "adulto",
        linha: "f",
        pele: 0x000000,
        cabelo: "natural",
        roupa: "macacao",
        tracos: [],
        edicao: { versao: 1, corDoCabelo: 0xffffff, coresDaRoupa: { inteira: 0x000000 } },
      },
    ],
    relacoes: [],
  });
}
function fundar(mundo: Mundo, rascunho: RascunhoDaFamilia) {
  mundo.aplicar({
    t: "sessao_entrou",
    sessaoId: "criador",
    perfilId: "criador",
    podeFundarFamilia: true,
  });
  return mundo.aplicar({
    t: "intencao",
    sessaoId: "criador",
    intencao: {
      mundoId: "catalogo",
      comandoId: "fundacao-catalogo",
      moradorId: null,
      versaoEsperada: 0,
      acao: { t: "fundar_familia", rascunho },
    },
  });
}

describe("catálogo admitido e persistido no mundo", () => {
  it("admite cores RGB livres só numa combinação e nas partes empacotadas", () => {
    const mundo = novo();
    const dados = familia();
    expect(fundar(mundo, dados)).toMatchObject({ ok: true });
    const morador = listar(mundo.estado.moradores).find((m) => m.nome === "Lua");
    expect(morador?.aparencia).toMatchObject({
      corpo: "adulta",
      pele: 0,
      edicao: dados.moradores[0]?.edicao,
    });
    expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
    expect(restaurar(mundo.fotografar()).hash()).toBe(mundo.hash());
  });
  it("recusa combinações inventadas, canais extras e canais omitidos antes de criar IDs", () => {
    for (const mudanca of ["cabelo", "roupa", "extra", "ausente"] as const) {
      const mundo = novo();
      const dados = familia();
      const morador = dados.moradores[0];
      if (!morador?.edicao) throw new Error("Morador sem edição");
      if (mudanca === "cabelo" || mudanca === "roupa") morador[mudanca] = "inventado";
      if (mudanca === "extra") morador.edicao.coresDaRoupa.oculos = 0xff0000;
      if (mudanca === "ausente") delete morador.edicao.coresDaRoupa.inteira;
      const antes = structuredClone(mundo.estado.contadores);
      expect(fundar(mundo, dados)).toMatchObject({
        ok: false,
        motivo: "requisito",
        detalhe: "aparencia_indisponivel",
      });
      expect(mundo.estado.contadores).toEqual(antes);
      expect(mundo.estado.fundacao).toBeNull();
    }
  });
  it("não herda mudanças do chamador e conserva o catálogo na fotografia e na visão", () => {
    const c = catalogo();
    const mundo = novo(c);
    const antes = structuredClone(c);
    const primeira = c.opcoes[0];
    if (!primeira) throw new Error("Opção ausente");
    primeira.rotuloDaRoupa = "Alterada";
    expect(mundo.estado.catalogoDeAparencias).toEqual(antes);
    expect(mundo.visao().catalogoDeAparencias).toEqual(antes);
    expect(restaurar(mundo.fotografar()).estado.catalogoDeAparencias).toEqual(antes);
  });
  it("recusa catálogo sem continuidade das fases, partes divergentes e corpo incompatível", () => {
    const incompleto = catalogo();
    incompleto.opcoes.pop();
    expect(() => novo(incompleto)).toThrow(/continuidade/);
    const partes = catalogo();
    const ultima = partes.opcoes.at(-1);
    if (!ultima) throw new Error("Opção ausente");
    ultima.edicaoInicial.coresDaRoupa = { cima: 0 };
    expect(() => conferirContinuidadeDaAparencia(partes)).toThrow(/Partes/);
    const errado = catalogo();
    const primeira = errado.opcoes[0];
    if (!primeira) throw new Error("Opção ausente");
    primeira.corpo = "adulto";
    expect(() => CatalogoDeAparenciasSchema.parse(errado)).toThrow(/Corpo/);
  });
  it("cresce conservando as escolhas e recusa corrupção posterior da aparência", () => {
    const mundo = novo(catalogo(), {
      envelhecimento: "normal",
      diasPorFase: { ...REGRAS_PADRAO.diasPorFase, adulto: 0 },
    });
    expect(fundar(mundo, familia()).ok).toBe(true);
    const morador = listar(mundo.estado.moradores).find((m) => m.nome === "Lua");
    if (!morador) throw new Error("Morador ausente");
    const antes = structuredClone(morador.aparencia);
    mundo.avancar(1000);
    expect(morador.fase).toBe("idoso");
    expect(morador.aparencia).toEqual({ ...antes, corpo: "idosa" });
    expect(verificarInvariantes(mundo.estado, mundo.presenca)).toEqual([]);
    if (!morador.aparencia.edicao) throw new Error("Edição ausente");
    morador.aparencia.edicao.coresDaRoupa.extra = 0;
    expect(verificarInvariantes(mundo.estado)).toContain(
      `${morador.id}: aparência fora do catálogo admitido`,
    );
  });
});

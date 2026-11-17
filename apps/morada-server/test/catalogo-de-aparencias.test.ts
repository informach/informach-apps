import { elencoDaCriacao } from "@informach/morada-arte";
import { type Manifesto, ManifestoSchema } from "@informach/morada-arte/manifesto";
import { FASES } from "@informach/morada-sim";
import { corpoDaFase } from "@informach/morada-sim/conteudo";
import { describe, expect, it } from "vitest";
import {
  catalogoDeAparenciasDaArte,
  conferirCatalogoDisponivel,
} from "../src/catalogo-de-aparencias";

/** Somente metadados inventados; a geometria real é conferida pelo workflow privado. */
function manifesto(): Extract<Manifesto, { versao: 3 }> {
  const lido = ManifestoSchema.parse({
    formato: "morada-arte",
    versao: 3,
    arte: { repositorio: "fixture-sintetica", commit: null },
    bibliotecas: [],
    objetos: [],
    acabamentos: [],
    aberturas: [],
    personagens: elencoDaCriacao().map((p) => {
      const fase = FASES.find((f) =>
        ["f", "m"].some((linha) => corpoDaFase(linha === "f" ? "f" : "m", f) === p.corpo),
      );
      const linha = fase && corpoDaFase("f", fase) === p.corpo ? "f" : "m";
      const partes = Object.entries(p.roupa).filter(
        ([, peca]) => peca.cor !== null && peca.cor !== undefined,
      );
      return {
        id: p.id,
        nome: p.nome,
        arquivo: `${p.id}.0123456789.glb`,
        bytes: 12,
        corpo: p.corpo,
        sexo: linha,
        faixa: fase,
        altura: 1.6,
        biblioteca: null,
        bibliotecaDeGravida: null,
        noDoCorpo: "corpo",
        noDaChupeta: null,
        expressoes: [{ nome: "neutro", no: "rosto_neutro", fala: [] }],
        gravidez: [],
        pesosDobrado: false,
        ancoras: {
          colo: [0, 1, 0],
          coloMedido: false,
          cabeca: [0, 1.5, 0],
          maos: {
            esq: { osso: "LeftHand", posicao: [0, 0, 0] },
            dir: { osso: "RightHand", posicao: [0, 0, 0] },
          },
        },
        desenho: { chamadas: 1, triangulos: 1, vertices: 3, texturas: 0 },
        sim: p.sim,
        criacao: {
          ...p.criacao,
          corDoCabelo: 0x3b251b,
          coresDaRoupa: Object.fromEntries(partes.map(([slot]) => [slot, 0x507090])),
        },
        cores: {
          referenciaDePele: "#808080",
          canais: [
            { id: "pele", origem: "pele", parte: null, inicial: [1, 1, 1] },
            ...partes.map(([slot]) => ({
              id: `roupa_${slot}`,
              origem: "roupa",
              parte: slot,
              inicial: [1, 1, 1],
            })),
          ],
        },
      };
    }),
  });
  if (lido.versao !== 3) throw new Error("Fixture com perfil incorreto");
  return lido;
}

describe("catálogo permitido a partir do pacote de arte", () => {
  it("bloqueia uma recuperação cujo pacote já não contenha as receitas persistidas", () => {
    const catalogo = catalogoDeAparenciasDaArte(manifesto());
    if (!catalogo) throw new Error("Catálogo ausente");
    expect(() => conferirCatalogoDisponivel(catalogo, catalogo)).not.toThrow();
    expect(() => conferirCatalogoDisponivel(null, undefined)).not.toThrow();
    expect(() => conferirCatalogoDisponivel(catalogo, undefined)).toThrow(/não atende/);
    expect(() =>
      conferirCatalogoDisponivel(catalogo, { ...catalogo, opcoes: catalogo.opcoes.slice(1) }),
    ).toThrow(/não atende/);
  });
  it("compõe todas as 48 opções a partir de metadados validados", () => {
    const m = manifesto();
    const catalogo = catalogoDeAparenciasDaArte(m);
    expect(catalogo?.opcoes).toHaveLength(48);
    expect(
      catalogo?.opcoes.find((o) => o.corpo === "adulta" && o.roupa === "macacao"),
    ).toMatchObject({
      fase: "adulto",
      linha: "f",
      edicaoInicial: { versao: 1, corDoCabelo: 0x3b251b, coresDaRoupa: { inteira: 0x507090 } },
    });
  });
  it("não habilita criação com pacotes antigos nem com V3 sem opções novas", () => {
    const m = manifesto();
    expect(catalogoDeAparenciasDaArte({ ...m, personagens: [] })).toBeUndefined();
    const antigo: Manifesto = {
      formato: "morada-arte",
      versao: 1,
      arte: m.arte,
      personagens: [],
      bibliotecas: [],
    };
    expect(catalogoDeAparenciasDaArte(antigo)).toBeUndefined();
  });
  it("recusa matriz incompleta e metadados de canais divergentes", () => {
    const m = manifesto();
    m.personagens.pop();
    expect(() => catalogoDeAparenciasDaArte(m)).toThrow(/continuidade/);
    const divergente = manifesto();
    const p = divergente.personagens[0];
    if (!p?.criacao) throw new Error("Opção ausente");
    p.criacao.coresDaRoupa.inventada = 0;
    expect(ManifestoSchema.safeParse(divergente).success).toBe(false);
  });
});

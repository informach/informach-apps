import type {
  BibliotecaDoManifesto,
  ClipeDoManifesto,
  Manifesto,
  PersonagemDoManifesto,
} from "@informach/morada-arte/manifesto";

/**
 * Manifestos de mentira para os testes dos ativos de arte: nenhum dado vem da
 * arte de verdade, só a forma do manifesto que o empacotador escreve.
 */

export function clipe(nome: string, extra: Partial<ClipeDoManifesto> = {}): ClipeDoManifesto {
  return {
    nome,
    duracao: 1,
    ciclo: true,
    deslocamento: false,
    dobrada: false,
    apoio: null,
    ...extra,
  };
}

export function biblioteca(
  id: string,
  extra: Partial<BibliotecaDoManifesto> = {},
): BibliotecaDoManifesto {
  return {
    id,
    arquivo: `anim-${id}.0123456789.glb`,
    bytes: 100,
    faixa: "adulto",
    gravida: false,
    clipes: [
      clipe("resident.idle.neutral"),
      clipe("resident.walk.normal"),
      clipe("resident.sit.chair.idle", {
        dobrada: true,
        apoio: { tipo: "assento", altura: 0.42, x: 0.01, y: -0.12 },
      }),
      clipe("resident.lie.idle", {
        dobrada: true,
        apoio: { tipo: "cama", altura: 0.9, x: 0, y: 0 },
      }),
      clipe("resident.care.hold_idle"),
      clipe("resident.care.rock"),
      clipe("resident.drink.stand"),
      clipe("resident.sleep.idle", { dobrada: true }),
    ],
    posturas: {
      parado: "resident.idle.neutral",
      andando: "resident.walk.normal",
      sentado: "resident.sit.chair.idle",
      deitado: "resident.lie.idle",
      dormindo: "resident.sleep.idle",
      carregando: "resident.care.hold_idle",
      no_colo: null,
    },
    interacoes: {
      "resident.eat.stand": { clipe: "resident.drink.stand", substituto: true },
      "resident.care.rock": { clipe: "resident.care.rock", substituto: false },
      "resident.sleep.bed": { clipe: "resident.sleep.idle", substituto: false },
      "resident.dance": { clipe: null, substituto: false },
    },
    ...extra,
  };
}

export function personagem(
  id: string,
  extra: Partial<PersonagemDoManifesto> = {},
): PersonagemDoManifesto {
  return {
    id,
    nome: id,
    arquivo: `${id}.abcdef0123.glb`,
    bytes: 100,
    corpo: "adulta",
    sexo: "f",
    faixa: "adulto",
    altura: 1.7,
    biblioteca: "adulto",
    bibliotecaDeGravida: null,
    noDoCorpo: "corpo",
    noDaChupeta: null,
    expressoes: [
      { nome: "neutro", no: "rosto_neutro", fala: [] },
      { nome: "dormindo", no: "rosto_dormindo", fala: [] },
    ],
    gravidez: [],
    pesosDobrado: false,
    ancoras: {
      colo: [0, 1.1, 0.25],
      coloMedido: true,
      cabeca: [0, 1.6, 0],
      maos: {
        esq: { osso: "LeftHand", posicao: [0.3, 1, 0] },
        dir: { osso: "RightHand", posicao: [-0.3, 1, 0] },
      },
    },
    desenho: { chamadas: 2, triangulos: 10, vertices: 30, texturas: 0 },
    sim: null,
    ...extra,
  };
}

export function manifesto(extra: Partial<Manifesto> = {}): Manifesto {
  return {
    formato: "morada-arte",
    versao: 1,
    arte: { repositorio: "informach/artes-3d", commit: null },
    personagens: [personagem("lia")],
    bibliotecas: [biblioteca("adulto")],
    ...extra,
  };
}

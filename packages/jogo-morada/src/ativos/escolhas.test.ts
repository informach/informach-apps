import { ManifestoSchema } from "@informach/morada-arte/manifesto";
import { describe, expect, it } from "vitest";
import { biblioteca, clipe, manifesto, personagem } from "../testes/manifesto-de-arte";
import {
  ajusteDoApoio,
  arquivosDoPersonagem,
  bibliotecasDaPose,
  clipeNaBiblioteca,
  escolherClipe,
  escolherPersonagem,
  expressaoDaPose,
  type PoseParaClipe,
  pesosDaGravidez,
} from "./escolhas";

const PARADO: PoseParaClipe = {
  postura: "em_pe",
  andando: false,
  agindo: false,
  animacao: null,
  carregando: false,
};

const APARENCIA = {
  linha: "f" as const,
  corpo: "adulta",
  pele: 0xcc8866,
  cabelo: "coque_alto",
  roupa: "casual_vestido",
  semente: 7,
};

describe("escolhas dos ativos de arte", () => {
  it("o manifesto de mentira tem a forma que o empacotador escreve", () => {
    expect(ManifestoSchema.safeParse(manifesto()).success).toBe(true);
  });

  it("veste o morador com o pacote mais parecido, da mesma fase", () => {
    const exato = personagem("lia", {
      sim: { corpo: "adulta", pele: 0xcc8866, cabelo: "coque_alto", roupa: "casual_vestido" },
    });
    const mesmoCorpo = personagem("duda", { corpo: "adulta" });
    const outroCorpo = personagem("marcos", { corpo: "adulto", sexo: "m" });
    const crianca = personagem("nina", { faixa: "crianca", corpo: "crianca_f" });
    const m = manifesto({ personagens: [outroCorpo, mesmoCorpo, exato, crianca] });

    expect(escolherPersonagem(m, { fase: "adulto", aparencia: APARENCIA })?.id).toBe("lia");
    expect(
      escolherPersonagem(m, { fase: "adulto", aparencia: { ...APARENCIA, roupa: "outra" } })?.id,
    ).toBe("duda");
    expect(
      escolherPersonagem(m, { fase: "adulto", aparencia: { ...APARENCIA, linha: "m", corpo: "x" } })
        ?.id,
    ).toBe("marcos");
    expect(escolherPersonagem(m, { fase: "crianca", aparencia: APARENCIA })?.id).toBe("nina");
    // Fase sem pacote: fica procedural.
    expect(escolherPersonagem(m, { fase: "idoso", aparencia: APARENCIA })).toBeNull();
  });

  it("um pacote sem biblioteca de animação ainda veste a fase dele", () => {
    const bebe = personagem("bebe", { faixa: "colo", corpo: "bebe_f", biblioteca: null });
    const m = manifesto({ personagens: [bebe] });
    expect(escolherPersonagem(m, { fase: "colo", aparencia: APARENCIA })?.id).toBe("bebe");
  });

  it("a postura escolhe o clipe; a interação vem antes; sem clipe, a postura", () => {
    const b = biblioteca("adulto");
    expect(clipeNaBiblioteca(b, PARADO)).toBe("resident.idle.neutral");
    expect(clipeNaBiblioteca(b, { ...PARADO, andando: true })).toBe("resident.walk.normal");
    expect(clipeNaBiblioteca(b, { ...PARADO, postura: "sentado" })).toBe("resident.sit.chair.idle");
    expect(clipeNaBiblioteca(b, { ...PARADO, postura: "deitado" })).toBe("resident.lie.idle");
    const comendo = { ...PARADO, agindo: true, animacao: "resident.eat.stand" };
    expect(clipeNaBiblioteca(b, comendo)).toBe("resident.drink.stand");
    // Indo até o lugar, a interação ainda não toca.
    expect(clipeNaBiblioteca(b, { ...comendo, agindo: false })).toBe("resident.idle.neutral");
    // Interação que a biblioteca não tem, ou desconhecida: a postura.
    const dancando = { ...PARADO, agindo: true, animacao: "resident.dance" };
    expect(clipeNaBiblioteca(b, dancando)).toBe("resident.idle.neutral");
    const deitadoDormindo = {
      ...PARADO,
      postura: "deitado" as const,
      agindo: true,
      animacao: "resident.nao.existe",
    };
    expect(clipeNaBiblioteca(b, deitadoDormindo)).toBe("resident.lie.idle");
  });

  it("quem carrega fica segurando, andando ou não; só um gesto de cuidado toma o lugar", () => {
    const b = biblioteca("adulto");
    const carregando = { ...PARADO, carregando: true };
    expect(clipeNaBiblioteca(b, carregando)).toBe("resident.care.hold_idle");
    expect(clipeNaBiblioteca(b, { ...carregando, andando: true })).toBe("resident.care.hold_idle");
    expect(
      clipeNaBiblioteca(b, { ...carregando, agindo: true, animacao: "resident.care.rock" }),
    ).toBe("resident.care.rock");
    expect(
      clipeNaBiblioteca(b, { ...carregando, agindo: true, animacao: "resident.eat.stand" }),
    ).toBe("resident.care.hold_idle");
    // O bebê no colo fica na pose de descanso: o visual o deita entre as mãos.
    expect(clipeNaBiblioteca(b, { ...PARADO, postura: "no_colo" })).toBeNull();
  });

  it("procura o clipe nas bibliotecas em ordem: a de grávida antes, a de adulto depois", () => {
    const gravida = biblioteca("adulta_gravida", {
      gravida: true,
      clipes: [clipe("resident.idle.neutral")],
      posturas: { parado: "resident.idle.neutral", carregando: null },
    });
    const adulto = biblioteca("adulto");
    const lia = personagem("lia", { bibliotecaDeGravida: "adulta_gravida" });
    expect(bibliotecasDaPose(lia, 0)).toEqual(["adulto"]);
    expect(bibliotecasDaPose(lia, 0.2)).toEqual(["adulto"]);
    expect(bibliotecasDaPose(lia, 0.5)).toEqual(["adulta_gravida", "adulto"]);
    expect(bibliotecasDaPose(personagem("x", { biblioteca: null }), 0.5)).toEqual([]);

    expect(escolherClipe([gravida, adulto], PARADO)?.biblioteca.id).toBe("adulta_gravida");
    const segurando = escolherClipe([gravida, adulto], { ...PARADO, carregando: true });
    expect(segurando?.biblioteca.id).toBe("adulto");
    expect(segurando?.clipe.nome).toBe("resident.care.hold_idle");
    expect(escolherClipe([], PARADO)).toBeNull();
  });

  it("sentado ou deitado, o corpo desce para o clipe cair no apoio", () => {
    const b = biblioteca("adulto");
    const sentar = b.clipes.find((c) => c.nome === "resident.sit.chair.idle") ?? null;
    const deitar = b.clipes.find((c) => c.nome === "resident.lie.idle") ?? null;
    // Blender (x, y, z) → cena (x, z, −y), e o corpo anda o contrário do apoio.
    expect(ajusteDoApoio(sentar, "sentado")).toEqual([-0.01, -0.42, -0.12]);
    expect(ajusteDoApoio(deitar, "deitado")).toEqual([-0, -0.9, 0]);
    // De pé a raiz já está no chão.
    expect(ajusteDoApoio(sentar, "em_pe")).toEqual([0, 0, 0]);
    expect(ajusteDoApoio(null, "sentado")).toEqual([0, 0, 0]);
    const sofa = clipe("resident.tv.watch", { apoio: { tipo: "movel", assento: 0.45 } });
    expect(ajusteDoApoio(sofa, "sentado")).toEqual([0, -0.45, 0]);
    expect(ajusteDoApoio(sofa, "deitado")).toEqual([0, 0, 0]);
  });

  it("dorme com o rosto de dormir; o resto, com o primeiro rosto", () => {
    const lia = personagem("lia");
    expect(expressaoDaPose(lia, { postura: "em_pe", agindo: false, animacao: null })).toBe(
      "neutro",
    );
    const dormindo = { postura: "deitado" as const, agindo: true, animacao: "resident.sleep.bed" };
    expect(expressaoDaPose(lia, dormindo)).toBe("dormindo");
    expect(expressaoDaPose(lia, { ...dormindo, agindo: false })).toBe("neutro");
    const semRosto = personagem("x", { expressoes: [{ nome: "neutro", no: "r", fala: [] }] });
    expect(expressaoDaPose(semRosto, dormindo)).toBe("neutro");
  });

  it("os estágios da gravidez passam de um para o outro", () => {
    const formas = ["gravidez_1", "gravidez_2", "gravidez_3"];
    expect(pesosDaGravidez(formas, 0)).toEqual([0, 0, 0]);
    expect(pesosDaGravidez(formas, 1 / 3)).toEqual([1, 0, 0]);
    expect(pesosDaGravidez(formas, 0.5).map((p) => Number(p.toFixed(3)))).toEqual([0.5, 0.5, 0]);
    expect(pesosDaGravidez(formas, 1)).toEqual([0, 0, 1]);
    expect(pesosDaGravidez(formas, 7)).toEqual([0, 0, 1]);
    expect(pesosDaGravidez([], 0.5)).toEqual([]);
  });

  it("um personagem precisa do próprio arquivo e do da biblioteca", () => {
    const m = manifesto();
    const lia = m.personagens[0];
    if (!lia) throw new Error("manifesto sem personagem");
    expect(arquivosDoPersonagem(m, lia)).toEqual([
      "lia.abcdef0123.glb",
      "anim-adulto.0123456789.glb",
    ]);
    expect(arquivosDoPersonagem(m, { ...lia, biblioteca: null })).toEqual(["lia.abcdef0123.glb"]);
  });
});

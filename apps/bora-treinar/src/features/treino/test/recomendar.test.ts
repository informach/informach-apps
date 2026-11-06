import { describe, expect, it } from "vitest";
import { niveisIniciais, ritmoDaIntensidade } from "@/features/perfil/regras";
import { CHAINS } from "../catalog/catalog";
import { estimateMinutes, WORKOUTS } from "../catalog/workouts";
import { type Candidato, recomendar } from "../engine/recomendar";

const catalogo: Candidato[] = WORKOUTS.map((w) => ({
  ref: `catalogo:${w.id}`,
  name: w.name,
  focus: w.focus,
  level: w.level,
  minutos: estimateMinutes(w),
  locked: false,
}));
const base = {
  candidatos: catalogo,
  minutosPref: 20,
  intensidade: "normal" as const,
  treinouHoje: false,
  dia: 0,
};
const sessao = (ref: string, dias = 1) => ({
  workoutRef: `catalogo:${ref}`,
  startedAt: Date.now() - dias * 86_400_000,
});
const foco = (ref?: string) => catalogo.find((c) => c.ref === ref)?.focus;

describe("treino do dia", () => {
  it("quem nunca treinou começa pelo Primeiro treino", () => {
    expect(recomendar({ ...base, recentes: [] })?.ref).toBe("catalogo:primeiro-treino");
  });
  it("alterna o foco do último treino e explica por quê", () => {
    const r = recomendar({ ...base, recentes: [sessao("corpo-todo")] });
    expect(foco(r?.ref)).not.toBe("Força");
    expect(r?.motivo).toContain("Da última vez foi Força");
  });
  it("leve não recebe treino avançado; forte recebe", () => {
    const leve = recomendar({
      ...base,
      intensidade: "leve",
      recentes: [sessao("primeiro-treino")],
    });
    expect(catalogo.find((c) => c.ref === leve?.ref)?.level).toBe("Iniciante");
    const forte = recomendar({
      ...base,
      intensidade: "forte",
      recentes: [sessao("primeiro-treino")],
    });
    expect(catalogo.find((c) => c.ref === forte?.ref)?.level).not.toBe("Iniciante");
  });
  it("respeita o plano: treino trancado nunca é recomendado", () => {
    const so = catalogo.map((c) => ({
      ...c,
      locked: !["catalogo:primeiro-treino", "catalogo:aquecimento-5"].includes(c.ref),
    }));
    for (let dia = 0; dia < 7; dia++) {
      const r = recomendar({ ...base, candidatos: so, recentes: [sessao("primeiro-treino")], dia });
      expect(["catalogo:primeiro-treino", "catalogo:aquecimento-5"]).toContain(r?.ref);
    }
  });
  it("quem já treinou hoje recebe algo leve", () => {
    const r = recomendar({ ...base, treinouHoje: true, recentes: [sessao("corpo-todo", 0)] });
    expect(r?.ref).toBe("catalogo:aquecimento-5");
  });
});

describe("primeiro acesso", () => {
  it("o ritmo decide o nível de partida, sem passar do último da trilha", () => {
    const sempre = niveisIniciais("sempre");
    for (const c of CHAINS) expect(sempre[c.id]?.level).toBe(Math.min(2, c.levels.length - 1));
    expect(Object.values(niveisIniciais("comecando")).every((s) => s.level === 0)).toBe(true);
    expect(ritmoDaIntensidade("forte")).toBe("sempre");
  });
});

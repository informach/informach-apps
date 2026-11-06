import { describe, expect, it } from "vitest";
import type { Desafio, SessaoDaSemana } from "./placar";
import {
  conferirMeta,
  desafioCooperativo,
  desafiosAte,
  diasRestantes,
  feitoNaSemana,
  META_PESSOAL_PADRAO,
  proximaMeta,
} from "./regras";

const reps = (target: number): Desafio => ({ metric: "repeticoes", exerciseId: null, target });
const treino = (profileId: string, n: number, durationSeconds = 600): SessaoDaSemana => ({
  profileId,
  durationSeconds,
  logs: [{ exerciseId: "agachamento", reps: n }],
});

describe("renovação do desafio pessoal", () => {
  it("cumpriu sobe 10%; não cumpriu fica; duas semanas sem cumprir desce 10%", () => {
    expect(proximaMeta(reps(250), true, null, "normal").target).toBe(275);
    expect(proximaMeta(reps(250), false, true, "normal").target).toBe(250);
    expect(proximaMeta(reps(250), false, null, "normal").target).toBe(250);
    expect(proximaMeta(reps(250), false, false, "normal").target).toBe(225);
  });

  it("não desce abaixo do piso da intensidade", () => {
    expect(proximaMeta(reps(100), false, false, "normal").target).toBe(100);
    expect(proximaMeta(reps(60), false, false, "leve").target).toBe(60);
  });

  it("sem histórico, começa da meta da intensidade", () => {
    expect(desafiosAte("2026-11-02", [], () => [], "forte")).toEqual([
      { weekStart: "2026-11-02", desafio: reps(META_PESSOAL_PADRAO.forte) },
    ]);
  });

  it("já tem o desafio da semana: nada a criar", () => {
    const registros = [{ weekStart: "2026-11-02", desafio: reps(250) }];
    expect(desafiosAte("2026-11-02", registros, () => [], "normal")).toEqual([]);
  });

  it("renova a partir da semana passada, com o que o perfil fez nela", () => {
    const registros = [{ weekStart: "2026-10-26", desafio: reps(250) }];
    const cumpriu = (s: string) => (s === "2026-10-26" ? [treino("a", 260)] : []);
    expect(desafiosAte("2026-11-02", registros, cumpriu, "normal")).toEqual([
      { weekStart: "2026-11-02", desafio: reps(275) },
    ]);
  });

  it("semanas puladas também ganham desafio, e duas sem cumprir descem a meta", () => {
    const registros = [{ weekStart: "2026-10-19", desafio: reps(250) }];
    const novos = desafiosAte("2026-11-02", registros, () => [], "normal");
    expect(novos).toEqual([
      { weekStart: "2026-10-26", desafio: reps(250) },
      { weekStart: "2026-11-02", desafio: reps(225) },
    ]);
  });

  it("depois de uma pausa de mais de 8 semanas, recomeça do padrão", () => {
    const registros = [{ weekStart: "2026-08-03", desafio: reps(900) }];
    expect(desafiosAte("2026-11-02", registros, () => [], "leve")).toEqual([
      { weekStart: "2026-11-02", desafio: reps(META_PESSOAL_PADRAO.leve) },
    ]);
  });

  it("treino de toque sem querer não conta", () => {
    expect(feitoNaSemana(reps(10), [treino("a", 3, 20), treino("a", 8, 20)])).toBe(8);
  });
});

describe("desafio da família, cooperativo", () => {
  const perfis = [
    { id: "a", name: "Ana", color: "#3D7BFF", intensity: "forte" as const },
    { id: "b", name: "Beto", color: "#FF7A45", intensity: "leve" as const },
    { id: "c", name: "Caio", color: "#2EC4B6", intensity: "normal" as const },
  ];

  it("soma todos e dá a cada um uma parte do tamanho da intensidade, sem ordenar", () => {
    const r = desafioCooperativo(reps(285), [treino("b", 90), treino("a", 40)], perfis);
    expect(r.total).toBe(130);
    expect(r.concluido).toBe(false);
    // pesos 1,15 + 0,7 + 1 = 2,85
    expect(r.partes.map((p) => [p.id, p.parte, p.valor])).toEqual([
      ["a", 115, 40],
      ["b", 70, 90],
      ["c", 100, 0],
    ]);
    expect(r.partes[1]?.progresso).toBe(1);
  });
});

describe("prazo e meta digitada", () => {
  it("conta os dias que faltam com hoje", () => {
    expect(diasRestantes("2026-11-02", "2026-11-02")).toBe(7);
    expect(diasRestantes("2026-11-02", "2026-11-08")).toBe(1);
  });

  it("confere a meta só ao salvar, com mensagens em português", () => {
    expect(conferirMeta(" 300 ")).toEqual({ ok: true, valor: 300 });
    expect(conferirMeta("1.500")).toEqual({ ok: true, valor: 1500 });
    expect(conferirMeta("")).toMatchObject({ ok: false, erro: "Digite a meta da semana." });
    expect(conferirMeta("12a")).toMatchObject({ ok: false });
    expect(conferirMeta("2,5")).toMatchObject({ ok: false });
    expect(conferirMeta("0")).toMatchObject({ ok: false });
    expect(conferirMeta("100001")).toMatchObject({ ok: false });
  });
});

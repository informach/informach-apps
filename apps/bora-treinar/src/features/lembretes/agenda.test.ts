import { describe, expect, it } from "vitest";
import { FREE_WORKOUT_IDS, workoutById } from "@/features/treino/catalog/workouts";
import { oQueEnviar, type PreferenciasFamilia } from "./agenda";
import { habitoDoPerfil, montarLembrete, montarResumo, SUGESTOES_LIBERADAS } from "./conteudo";

const base: PreferenciasFamilia = {
  reminderDays: 0,
  reminderHour: 18,
  timezone: "America/Sao_Paulo",
  weeklySummary: false,
  weeklySummaryWeek: null,
};
// segunda-feira, 02/11/2026, 18:30 em São Paulo
const segunda18 = new Date("2026-11-02T21:30:00Z");

describe("quando enviar", () => {
  it("lembrete só no dia e na hora escolhidos", () => {
    const segunda = 1 << 1;
    expect(oQueEnviar({ ...base, reminderDays: segunda }, segunda18).lembrete).toBe("2026-11-02");
    expect(
      oQueEnviar({ ...base, reminderDays: segunda, reminderHour: 7 }, segunda18).lembrete,
    ).toBeNull();
    expect(oQueEnviar({ ...base, reminderDays: 1 << 2 }, segunda18).lembrete).toBeNull();
  });
  it("lembrete ainda sai se a rodada da hora certa falhou, até 3 horas depois", () => {
    const segunda = 1 << 1;
    // marcado para 16h; são 18h30: a rodada das 16h e a das 17h podem ter falhado
    expect(
      oQueEnviar({ ...base, reminderDays: segunda, reminderHour: 16 }, segunda18).lembrete,
    ).toBe("2026-11-02");
    // marcado para 15h: já passou do prazo, o lembrete não ajuda mais
    expect(
      oQueEnviar({ ...base, reminderDays: segunda, reminderHour: 15 }, segunda18).lembrete,
    ).toBeNull();
  });
  it("resumo na segunda depois das 8h, uma vez por semana", () => {
    expect(oQueEnviar({ ...base, weeklySummary: true }, segunda18).resumo).toEqual({
      semana: "2026-11-02",
      anterior: "2026-10-26",
    });
    expect(
      oQueEnviar({ ...base, weeklySummary: true, weeklySummaryWeek: "2026-11-02" }, segunda18)
        .resumo,
    ).toBeNull();
    expect(
      oQueEnviar({ ...base, weeklySummary: true }, new Date("2026-11-02T09:00:00Z")).resumo,
    ).toBeNull();
  });
});

describe("texto do resumo", () => {
  it("conta treinos de cada perfil e o desafio", () => {
    const resumo = montarResumo(
      [
        { id: "a", name: "Ana", color: "#3D7BFF" },
        { id: "b", name: "Beto", color: "#FF7A45" },
      ],
      [
        {
          profileId: "a",
          durationSeconds: 600,
          logs: [{ exerciseId: "agachamento", kind: "reps", reps: 30, holdSeconds: 0 }],
        },
      ],
      { metric: "treinos", exerciseId: null, target: 1 },
    );
    expect(resumo.blocos[0]?.linhas[0]).toBe("1 treino, 10 minutos e 30 repetições.");
    expect(resumo.blocos[1]?.linhas[0]).toContain("Não treinou");
    expect(resumo.linhaDesafio).toContain("cumprido");
  });
});

describe("texto do resumo: hábito de cada perfil", () => {
  const SP = "America/Sao_Paulo";
  const DIA = 86_400_000;
  // segunda, 02/11/2026, 09h em SP: o resumo é da semana de 26/10 a 01/11
  const agora = Date.parse("2026-11-02T12:00:00Z");
  const em = (data: string) => Date.parse(`${data}T15:00:00Z`);
  const somada = (startedAt: number, volume = 30, duration = 600) => ({
    profileId: "a",
    startedAt,
    duration,
    volume,
  });
  const serie = (exerciseId: string, reps: number) => ({
    exerciseId,
    kind: "reps" as const,
    reps,
    holdSeconds: 0,
  });

  it("meta cumprida, semanas seguidas, recordes e próximo nível", () => {
    const historico = [
      ...[0, 1].map((i) => somada(em("2026-10-19") + i * DIA)),
      ...[0, 2, 4].map((i) => somada(em("2026-10-26") + i * DIA)),
      somada(em("2026-10-28"), 2, 20), // não conta como treino
    ];
    const habito = habitoDoPerfil({
      meta: 2,
      historico,
      daSemana: [
        { profileId: "a", durationSeconds: 600, logs: [serie("flexao", 12), serie("ponte", 10)] },
      ],
      melhoresAntes: new Map([["flexao", { bestSet: 10, bestHold: 0 }]]),
      progresso: { empurrar: { level: 0, bonus: 6, streak: 2, struggle: 0 } },
      agora,
      fuso: SP,
    });
    expect(habito).toMatchObject({ dias: 3, meta: 2, cumprida: true, seguidas: 2 });
    expect(habito.recordes.map((r) => [r.exerciseId, r.value])).toEqual([["flexao", 12]]);
    const resumo = montarResumo(
      [{ id: "a", name: "Ana", color: "#3D7BFF", habito }],
      [{ profileId: "a", durationSeconds: 600, logs: [serie("flexao", 12)] }],
      null,
    );
    const linhas = resumo.blocos[0]?.linhas ?? [];
    expect(linhas).toContain("Meta da semana cumprida: 3 dias de treino. São 2 semanas seguidas.");
    expect(linhas.some((l) => l.startsWith("Recorde da semana: "))).toBe(true);
    expect(habito.proximosNiveis).toEqual([{ de: "Flexão inclinada", para: "Flexão com joelhos" }]);
    expect(linhas).toContain(
      "Próximo nível liberado: de Flexão inclinada para Flexão com joelhos. É só aceitar no app.",
    );
  });

  it("sem assinatura, o resumo não oferece subir de nível", () => {
    const habito = habitoDoPerfil({
      meta: 3,
      historico: [],
      daSemana: [],
      melhoresAntes: new Map(),
      progresso: null,
      agora,
      fuso: SP,
    });
    expect(habito).toMatchObject({ dias: 0, cumprida: false, seguidas: 0, proximosNiveis: [] });
  });

  it("sessão que não conta como treino fica fora do resumo", () => {
    const resumo = montarResumo(
      [{ id: "a", name: "Ana", color: "#3D7BFF" }],
      [{ profileId: "a", durationSeconds: 20, logs: [serie("flexao", 2)] }],
      null,
    );
    expect(resumo.treinou).toBe(false);
    expect(resumo.blocos[0]?.linhas[0]).toContain("Não treinou");
  });
});

describe("texto do lembrete", () => {
  const SP = "America/Sao_Paulo";
  // quinta, 05/11/2026, 18h em SP
  const agora = Date.parse("2026-11-05T21:00:00Z");
  const perfis = [
    { id: "h", name: "Helena", weeklyGoal: 3 },
    { id: "t", name: "Tomás", weeklyGoal: 2 },
    { id: "m", name: "Mãe", weeklyGoal: 1 },
  ];
  const sessao = (profileId: string, iso: string, volume = 20, duration = 600) => ({
    profileId,
    startedAt: Date.parse(iso),
    duration,
    volume,
  });

  it("lista quem não treinou hoje, com o quanto falta para a meta da semana", () => {
    const lembrete = montarLembrete(
      perfis,
      [
        sessao("h", "2026-11-03T12:00:00Z"),
        sessao("t", "2026-11-05T12:00:00Z"), // treinou hoje: fica fora
        sessao("m", "2026-11-02T12:00:00Z"),
        sessao("m", "2026-11-05T13:00:00Z", 2, 20), // só um toque hoje: não conta
      ],
      agora,
      SP,
      false,
    );
    expect(lembrete?.linhas).toEqual([
      "Helena: 1 de 3 dias nesta semana.",
      "Mãe: meta da semana cumprida (1 dia de treino).",
    ]);
  });

  it("todos treinaram hoje: sem lembrete", () => {
    const hoje = "2026-11-05T12:00:00Z";
    expect(
      montarLembrete(
        perfis,
        perfis.map((p) => sessao(p.id, hoje)),
        agora,
        SP,
        true,
      ),
    ).toBeNull();
  });

  it("o plano gratuito sugere só treinos gratuitos", () => {
    const gratis = montarLembrete(perfis, [], agora, SP, false)?.sugestao ?? "";
    for (const id of FREE_WORKOUT_IDS) expect(gratis).toContain(workoutById(id).name);
    const liberado = montarLembrete(perfis, [], agora, SP, true)?.sugestao ?? "";
    for (const id of SUGESTOES_LIBERADAS) expect(liberado).toContain(workoutById(id).name);
  });
});

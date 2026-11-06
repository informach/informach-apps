import { describe, expect, it } from "vitest";
import { relogioDa } from "./relogio";
import {
  criancaPodeMarcar,
  falaDoLembrete,
  instanteDa,
  MAX_TOQUES,
  MIN,
  precisaAlertarPais,
  proximoLembrete,
  type RegistroLembrete,
  rotuloDosDias,
  type Tarefa,
  tarefasDoDia,
  visaoDoDia,
} from "./rotina";

// Portado dos testes do protótipo Taskids, com o relógio no fuso da família.
const tarefa = (id: string, time: string, extra: Partial<Tarefa> = {}): Tarefa => ({
  id,
  title: id,
  icon: "star",
  time,
  days: 0b1111111,
  durationMin: null,
  stars: 2,
  steps: [],
  needs: [],
  thenText: null,
  detail: null,
  remind: true,
  requiresApproval: false,
  ...extra,
});

// Quarta, 4 de novembro de 2026, em São Paulo (UTC−3).
const as = (hhmm: string, fuso = "America/Sao_Paulo") => {
  const [h, m] = hhmm.split(":").map(Number);
  return relogioDa(Date.UTC(2026, 10, 4, (h ?? 0) + 3, m ?? 0), fuso);
};
const ms = (hhmm: string) => as(hhmm).ms;
const ajustes = { warnBefore: 5, repeatEvery: 5 };

describe("relógio da casa", () => {
  it("lê data, dia da semana e minutos no fuso da família, não no do servidor", () => {
    const r = as("19:00");
    expect(r).toMatchObject({ data: "2026-11-04", diaDaSemana: 3, minutos: 19 * 60 });
    const manaus = relogioDa(r.ms, "America/Manaus");
    expect(manaus.minutos).toBe(18 * 60);
  });
  it("o instante da tarefa é o do dia local", () => {
    expect(instanteDa(tarefa("x", "07:00"), as("15:00"))).toBe(ms("07:00"));
  });
  it("vira o dia à meia-noite local", () => {
    expect(as("23:59").data).toBe("2026-11-04");
    expect(relogioDa(ms("23:59") + 2 * MIN, "America/Sao_Paulo").data).toBe("2026-11-05");
  });
});

describe("proximoLembrete", () => {
  const banho = tarefa("banho", "19:00");
  const tarefas = [banho];

  it("fica quieto antes da janela de aviso", () => {
    expect(proximoLembrete(tarefas, new Set(), {}, ajustes, as("18:50"))).toBeNull();
  });

  it("avisa a transição 5 minutos antes, uma vez só", () => {
    expect(proximoLembrete(tarefas, new Set(), {}, ajustes, as("18:55"))?.tipo).toBe("aviso");
    const registros = { banho: { dueCount: 0, warnedAt: ms("18:55") } };
    expect(proximoLembrete(tarefas, new Set(), registros, ajustes, as("18:57"))).toBeNull();
  });

  it("toca no horário e repete a cada N minutos enquanto não for marcada", () => {
    expect(proximoLembrete(tarefas, new Set(), {}, ajustes, as("19:00"))).toMatchObject({
      tipo: "agora",
      repeticao: 0,
    });
    const registros: Record<string, RegistroLembrete> = {
      banho: { dueCount: 1, lastDueAt: ms("19:00") },
    };
    expect(proximoLembrete(tarefas, new Set(), registros, ajustes, as("19:04"))).toBeNull();
    expect(proximoLembrete(tarefas, new Set(), registros, ajustes, as("19:05"))).toMatchObject({
      tipo: "agora",
      repeticao: 1,
    });
  });

  it("para de tocar quando a tarefa é marcada", () => {
    expect(proximoLembrete(tarefas, new Set(["banho"]), {}, ajustes, as("19:00"))).toBeNull();
  });

  it("desiste depois de 3 horas para não acumular avisos velhos", () => {
    const registros = { banho: { dueCount: 3, lastDueAt: ms("19:20") } };
    expect(proximoLembrete(tarefas, new Set(), registros, ajustes, as("22:01"))).toBeNull();
  });

  it("para de repetir depois de MAX_TOQUES", () => {
    const registros = { banho: { dueCount: MAX_TOQUES, lastDueAt: ms("19:30") } };
    expect(proximoLembrete(tarefas, new Set(), registros, ajustes, as("19:40"))).toBeNull();
  });

  it("tarefa esquecida dá lugar à próxima quando chega a vez dela", () => {
    const lista = [tarefa("lanche", "16:00"), banho];
    const registros = { lanche: { dueCount: 2, lastDueAt: ms("16:05") } };
    expect(proximoLembrete(lista, new Set(), registros, ajustes, as("16:30"))?.tarefa.id).toBe(
      "lanche",
    );
    expect(proximoLembrete(lista, new Set(), registros, ajustes, as("18:56"))).toMatchObject({
      tipo: "aviso",
      tarefa: { id: "banho" },
    });
  });

  it("respeita tarefas sem lembrete", () => {
    expect(
      proximoLembrete(
        [tarefa("x", "19:00", { remind: false })],
        new Set(),
        {},
        ajustes,
        as("19:00"),
      ),
    ).toBeNull();
  });

  it("prioriza a tarefa mais cedo", () => {
    const evento = proximoLembrete(
      [tarefa("a", "19:00"), tarefa("b", "19:30")],
      new Set(),
      {},
      ajustes,
      as("19:03"),
    );
    expect(evento?.tarefa.id).toBe("a");
  });

  it('"Adiar 15 min" segura o lembrete e depois toca de novo', () => {
    const adiado = { banho: { dueCount: 2, lastDueAt: ms("19:05"), snoozeUntil: ms("19:20") } };
    expect(proximoLembrete(tarefas, new Set(), adiado, ajustes, as("19:15"))).toBeNull();
    expect(proximoLembrete(tarefas, new Set(), adiado, ajustes, as("19:20"))).toMatchObject({
      tipo: "agora",
      repeticao: 2,
    });
  });

  it('"Lembrar agora" dos pais toca na hora, mesmo fora do intervalo', () => {
    const registros = { banho: { dueCount: 1, lastDueAt: ms("19:00"), nudgeAt: ms("19:01") } };
    expect(proximoLembrete(tarefas, new Set(), registros, ajustes, as("19:01"))).toMatchObject({
      tipo: "agora",
    });
  });

  it("sem aviso de transição quando warnBefore = 0", () => {
    expect(
      proximoLembrete(tarefas, new Set(), {}, { warnBefore: 0, repeatEvery: 5 }, as("18:58")),
    ).toBeNull();
  });

  it("chama a criança pelo nome", () => {
    const evento = { tipo: "agora" as const, tarefa: banho, repeticao: 0 };
    expect(falaDoLembrete(evento, "Lucas", 5)).toBe("Lucas, é hora de: banho.");
    expect(falaDoLembrete({ ...evento, repeticao: 2 }, "Lucas", 5)).toBe(
      "Lucas, ainda falta: banho. Vamos lá?",
    );
    expect(falaDoLembrete({ ...evento, tipo: "aviso" }, "Lucas", 5)).toContain("daqui a 5 minutos");
  });
});

describe("visaoDoDia", () => {
  const tarefas = [
    tarefa("cafe", "07:00"),
    tarefa("licao", "15:30"),
    tarefa("lanche", "16:00"),
    tarefa("banho", "19:00"),
  ];

  it("foca na tarefa da vez", () => {
    const v = visaoDoDia(tarefas, new Set(["cafe"]), as("15:40"));
    expect(v.foco?.id).toBe("licao");
    expect(v.focoComecou).toBe(true);
    expect(v.proxima?.id).toBe("lanche");
    expect(v.itens.map((i) => i.estado)).toEqual(["feita", "agora", "por-vir", "por-vir"]);
  });

  it("esquecidas de antes viram atrasadas; o cartão mostra a mais recente", () => {
    const v = visaoDoDia(tarefas, new Set(), as("16:10"));
    expect(v.foco?.id).toBe("lanche");
    expect(v.itens.map((i) => i.estado)).toEqual(["atrasada", "atrasada", "agora", "por-vir"]);
  });

  it("feita a tarefa da vez, mostra a próxima (não volta para as esquecidas)", () => {
    const v = visaoDoDia(tarefas, new Set(["licao"]), as("15:40"));
    expect(v.foco?.id).toBe("lanche");
    expect(v.focoComecou).toBe(false);
    expect(v.itens.map((i) => i.estado)).toEqual(["atrasada", "feita", "por-vir", "por-vir"]);
  });

  it("no fim do dia, sobrando só esquecidas, o cartão mostra a última delas", () => {
    const v = visaoDoDia(tarefas, new Set(["licao", "lanche", "banho"]), as("21:00"));
    expect(v.foco?.id).toBe("cafe");
  });

  it("mostra a próxima quando nada começou ainda", () => {
    const v = visaoDoDia(tarefas, new Set(), as("06:00"));
    expect(v.foco?.id).toBe("cafe");
    expect(v.focoComecou).toBe(false);
  });

  it("sem foco quando tudo foi feito", () => {
    expect(
      visaoDoDia(tarefas, new Set(tarefas.map((t) => t.id)), as("21:00")).foco,
    ).toBeUndefined();
  });
});

describe("tarefasDoDia, marcação e alertas", () => {
  it("filtra pelo dia da semana e ordena por horário", () => {
    const lista = [
      tarefa("b", "19:00"),
      tarefa("a", "07:00"),
      tarefa("fds", "09:00", { days: 0b1000001 }),
    ];
    expect(tarefasDoDia(lista, 3).map((t) => t.id)).toEqual(["a", "b"]);
    expect(tarefasDoDia(lista, 6).map((t) => t.id)).toEqual(["a", "fds", "b"]);
  });

  it("a criança marca o que já chegou e a próxima da fila, nunca a noite inteira de uma vez", () => {
    const lista = [tarefa("licao", "15:30"), tarefa("lanche", "16:00"), tarefa("banho", "19:00")];
    const agora = as("15:40");
    expect(criancaPodeMarcar(lista[0] as Tarefa, lista, new Set(), agora)).toBe(true);
    expect(criancaPodeMarcar(lista[1] as Tarefa, lista, new Set(), agora)).toBe(true);
    expect(criancaPodeMarcar(lista[2] as Tarefa, lista, new Set(), agora)).toBe(false);
    expect(criancaPodeMarcar(lista[2] as Tarefa, lista, new Set(["lanche"]), agora)).toBe(true);
    expect(criancaPodeMarcar(lista[0] as Tarefa, lista, new Set(["licao"]), agora)).toBe(false);
  });

  it("alerta os pais depois de N lembretes sem marcar, mesmo com o tablet desligado", () => {
    const banho = tarefa("banho", "19:00");
    const regra = { repeatEvery: 5, alertAfter: 2 };
    expect(precisaAlertarPais(banho, false, regra, as("19:04"))).toBe(false);
    expect(precisaAlertarPais(banho, false, regra, as("19:05"))).toBe(true);
    expect(precisaAlertarPais(banho, true, regra, as("19:30"))).toBe(false);
    expect(precisaAlertarPais({ ...banho, remind: false }, false, regra, as("19:30"))).toBe(false);
    // Tarefa de muitas horas atrás não vira alerta novo (ex.: família que começou à noite).
    expect(precisaAlertarPais(tarefa("cafe", "07:00"), false, regra, as("19:30"))).toBe(false);
  });

  it("descreve os dias da semana", () => {
    expect(rotuloDosDias(0b0111110)).toBe("seg a sex");
    expect(rotuloDosDias(0b1111111)).toBe("todos os dias");
    expect(rotuloDosDias(0b0000110)).toBe("seg, ter");
  });

  it("MIN vale um minuto", () => expect(MIN).toBe(60_000));
});

import { describe, expect, it } from "vitest";
import {
  buildWeeklyEmail,
  renderWeeklyEmailHtml,
  renderWeeklyEmailText,
  type WeeklyEmailItem,
} from "./weekly-email";

// Domingo, 18 de outubro de 2026, às 18h: a semana do canvas.
const today = "2026-10-18";
const item = (patch: Partial<WeeklyEmailItem>): WeeklyEmailItem => ({
  profileName: "Clara",
  title: "Atividade",
  type: "task",
  subjectName: null,
  subjectColorIndex: null,
  dueAt: null,
  time: null,
  location: null,
  estimatedMinutes: null,
  ...patch,
});

const items: WeeklyEmailItem[] = [
  item({
    title: "Enviar a autorização do passeio",
    type: "authorization",
    dueAt: "2026-10-16",
  }),
  item({
    title: "Páginas 32 e 33 do livro",
    subjectName: "Matemática",
    subjectColorIndex: 1,
    dueAt: "2026-10-19",
  }),
  item({
    profileName: "Miguel",
    title: "Exercícios 1 a 10 da apostila",
    subjectName: "Matemática",
    subjectColorIndex: 1,
    dueAt: "2026-10-19",
  }),
  item({
    title: "Passeio ao museu",
    type: "event",
    dueAt: "2026-10-21",
    time: "08:00",
    location: "saída no portão principal",
  }),
  item({
    title: "Prova de interpretação de texto",
    type: "exam",
    subjectName: "Português",
    subjectColorIndex: 2,
    dueAt: "2026-10-22",
    estimatedMinutes: 30,
  }),
  item({
    profileName: "Miguel",
    title: "Prova da unit 4",
    type: "exam",
    subjectName: "Inglês",
    subjectColorIndex: 5,
    dueAt: "2026-10-22",
    estimatedMinutes: 60,
  }),
  item({
    profileName: "Miguel",
    title: "Maquete da vila colonial",
    type: "project",
    subjectName: "História",
    subjectColorIndex: 4,
    dueAt: "2026-10-23",
    estimatedMinutes: 90,
  }),
  item({ title: "Devolver o livro da biblioteca", type: "reminder" }),
];

const email = buildWeeklyEmail({
  todayIso: today,
  items,
  backpacks: {
    "2026-10-20": [
      { profileName: "Miguel", items: ["touca", "óculos", "toalha"], onlyFrom: "natação" },
    ],
  },
  subject: "De 19 a 23 de outubro: quinta está cheia",
  digestDay: 0,
  digestHour: 18,
});

describe("buildWeeklyEmail", () => {
  // O canvas sugere segunda ou terça; a conta escolhe os dois dias mais livres
  // antes do dia cheio, e na segunda já há duas tarefas.
  it("names the school week and the full day, with when to start studying", () => {
    expect(email.heading).toBe("A semana de 19 a 23 de outubro");
    expect(email.full?.lead).toBe("Quinta está cheia:");
    expect(email.full?.text).toBe(
      "prova de Português de Clara e prova de Inglês de Miguel. Se der, comece a estudar na terça ou na quarta.",
    );
  });

  it("says what was left behind, one day per row and what has no date", () => {
    expect(email.late).toBe("enviar a autorização do passeio de Clara, que era até sexta, 16.");
    expect(email.days.map((day) => day.label)).toEqual([
      "seg, 19",
      "ter, 20",
      "qua, 21",
      "qui, 22",
      "sex, 23",
    ]);
    expect(email.days[0]?.lines.map((line) => line.text)).toEqual([
      "Clara · Matemática: páginas 32 e 33 do livro",
      "Miguel · Matemática: exercícios 1 a 10 da apostila",
    ]);
    expect(email.days[1]?.backpack).toEqual([
      "Na mochila de Miguel: touca, óculos e toalha de natação",
    ]);
    expect(email.days[2]?.lines[0]?.text).toBe(
      "Clara: passeio ao museu, às 8h, saída no portão principal",
    );
    expect(email.days[3]?.full).toBe(true);
    expect(email.days[4]?.lines[0]?.text).toBe(
      "Miguel · História: maquete da vila colonial, cerca de 1h30",
    );
    expect(email.undated).toEqual(["Clara: devolver o livro da biblioteca"]);
    expect(email.schedule).toBe("Você recebe este resumo aos domingos, às 18h.");
    expect(email.preheader).toBe(
      "2 provas na quinta, trabalho de História na sexta e 2 tarefas na segunda.",
    );
  });

  it("renders the email without dashes and with every link", () => {
    const links = {
      weekUrl: "https://agenda.test/calendario?date=2026-10-19",
      settingsUrl: "https://agenda.test/familia/ajustes",
      unsubscribeUrl: "https://agenda.test/sair",
      logoUrl: "https://agenda.test/logo.png",
      footnote: "Marcar como feito vale só para a sua casa: a escola não recebe aviso.",
    };
    const html = renderWeeklyEmailHtml(email, links);
    const text = renderWeeklyEmailText(email, links);
    for (const out of [html, text]) {
      expect(out).not.toMatch(/[\u2014\u2013]/);
      expect(out).toContain("Abrir a semana na Agenda");
      expect(out).toContain(links.settingsUrl);
      expect(out).toContain(links.unsubscribeUrl);
    }
    expect(html).toContain("#3B82F6");
    expect(html).toContain("Ficou para trás:");
  });
});

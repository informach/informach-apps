import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPlatformPackage,
  generateQuiz,
  PACKAGE_FORMAT,
  type QuizItem,
  type QuizLine,
  quizProblem,
  suspectAnswer,
  validateChapters,
} from "../src/shared/platformPackage.ts";

const lines: QuizLine[] = [
  { n: 1, speaker: "Professora", text: "O farol acende quando o barco chega perto da costa." },
  { n: 2, speaker: "Professora", text: "O bloco repita dez vezes faz o barco andar dez passos." },
  { n: 3, speaker: "Debinha", text: "Sem a luz do farol o barco não acha o caminho." },
];

const question = (extra: Partial<QuizItem> = {}): QuizItem => ({
  question: "Quando o farol acende?",
  options: ["Quando o barco chega perto", "De manhã", "Quando chove", "Nunca"],
  correct: 0,
  line: 1,
  source: lines[0].text,
  ...extra,
});

test("validateChapters: first at 0:00, at least 3, in order, each 10 s or longer", () => {
  const ok = [
    { time: 0, title: "Abertura" },
    { time: 12, title: "O jogo" },
    { time: 40, title: "Desafio" },
  ];
  assert.deepEqual(validateChapters(ok, 60), { ok: true, problems: [] });
  assert.match(
    validateChapters([{ time: 3, title: "A" }, ...ok.slice(1)], 60).problems[0],
    /0:03 e não em 0:00/,
  );
  assert.match(validateChapters(ok.slice(0, 2), 60).problems.join(" "), /são 2, o mínimo é 3/);
  // Out of order (the list is judged as it is, not sorted).
  assert.match(
    validateChapters([ok[0], ok[2], { time: 25, title: "Volta" }], 60).problems.join(" "),
    /"Volta" vem antes do capítulo anterior/,
  );
  // The last chapter runs to the end of the video: 55 to 60 is too short.
  assert.match(
    validateChapters([...ok, { time: 55, title: "Fim" }], 60).problems.join(" "),
    /"Fim" tem menos de 10 s/,
  );
  assert.equal(validateChapters([], 60).ok, false);
});

test("quizProblem: four distinct options, one right, and the line it cites as it is", () => {
  assert.equal(quizProblem(question(), lines), null);
  assert.match(quizProblem(question({ options: ["a", "b", "c"] }), lines) ?? "", /3 alternativas/);
  assert.match(
    quizProblem(question({ options: ["Sim", "sim!", "Não", "Talvez"] }), lines) ?? "",
    /se repetem/,
  );
  assert.match(quizProblem(question({ correct: 4 }), lines) ?? "", /qual alternativa é a certa/);
  assert.match(quizProblem(question({ line: 9 }), lines) ?? "", /fala 9 não existe/);
  assert.match(
    quizProblem(question({ source: "uma frase que ninguém disse" }), lines) ?? "",
    /não cita a fala 1/,
  );
});

test("generateQuiz keeps a checked answer and asks again once with the problems", async () => {
  const prompts: string[] = [];
  const answers = [
    // First: a question with a repeated option, wrapped in prose (refused).
    `Aqui está: {"questions":[{"question":"O que o bloco repita faz?","options":["Anda","Anda","Para","Volta"],"correct":0,"line":2,"quote":"repita dez vezes"}]}`,
    // Then a valid one, in a code block.
    '```json\n{"questions":[{"question":"O que o bloco repita faz?","options":["Anda dez passos","Para o barco","Acende o farol","Apaga a luz"],"correct":0,"line":2,"quote":"faz o barco andar dez passos"}]}\n```',
  ];
  const quiz = await generateQuiz(
    lines,
    async (prompt) => {
      prompts.push(prompt);
      return answers[prompts.length - 1];
    },
    1,
  );
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /refused: pergunta 1: as alternativas se repetem/);
  assert.equal(quiz.length, 1);
  assert.equal(quiz[0].source, lines[1].text);
  assert.equal(quiz[0].correct, 0);
});

test("the quoted excerpt must be in the line, and an answer its line does not back is suspect", () => {
  assert.equal(quizProblem(question({ quote: "acende quando o barco" }), lines), null);
  assert.match(
    quizProblem(question({ quote: "o barco voa" }), lines) ?? "",
    /o trecho "o barco voa" não está na fala 1/,
  );
  assert.match(quizProblem(question({ quote: "  " }), lines) ?? "", /não trouxe o trecho/);
  assert.equal(suspectAnswer(question({ quote: "acende quando o barco chega perto" })), false);
  assert.equal(
    suspectAnswer(question({ options: ["Um dragão", "De manhã", "Quando chove", "Nunca"] })),
    true,
  );
  // A short answer says nothing either way.
  assert.equal(suspectAnswer(question({ options: ["Sim", "Não", "Talvez", "Nunca"] })), false);
});

test("generateQuiz gives up after two refused answers, with the reason", async () => {
  await assert.rejects(
    generateQuiz(
      lines,
      async () =>
        '{"questions":[{"question":"?","options":["a","b","c","d"],"correct":7,"line":1,"quote":"O farol acende"}]}',
    ),
    /não passou na conferência: pergunta 1: não diz qual alternativa é a certa/,
  );
  await assert.rejects(
    generateQuiz([], async () => "{}"),
    /ainda não tem falas/,
  );
});

test("buildPlatformPackage: valid chapters, quiz, thumbnail, captions and the video's hash", () => {
  const pack = buildPlatformPackage(
    {
      lesson: "Aula 3",
      course: "Sistema Zero",
      videoId: "F1P1-V01",
      title: "A Chave do Farol",
      description: "Programe o farol.",
      summary: "Resumo.",
      chapters: [
        { time: 0, title: "Abertura" },
        { time: 15.4, title: "O jogo" },
        { time: 40, title: "Desafio" },
      ],
      // Only the question the person reviewed goes up.
      quiz: [question({ reviewed: true }), question({ question: "Outra?" })],
      thumbnail: { time: 12, title: "Farol" },
    },
    {
      video: "Aula 3.mp4",
      sha256: "ab".repeat(32),
      seconds: 61.234,
      width: 1920,
      height: 1080,
      thumbnail: { file: "Aula 3.jpg", time: 12 },
      captions: [
        { lang: "pt-BR", srt: "Aula 3.srt", vtt: "Aula 3.vtt" },
        { lang: "en", srt: "Aula 3.en.srt", vtt: "Aula 3.en.vtt" },
      ],
      now: new Date("2026-10-18T12:00:00Z"),
    },
  );
  assert.equal(pack.format, PACKAGE_FORMAT);
  assert.equal(pack.videoId, "F1P1-V01");
  assert.deepEqual(pack.chapters, [
    { time: 0, clock: "0:00", title: "Abertura" },
    { time: 15, clock: "0:15", title: "O jogo" },
    { time: 40, clock: "0:40", title: "Desafio" },
  ]);
  assert.equal(pack.chapterProblems, undefined);
  // The quiz goes without the source text (the platform gets the line number).
  assert.deepEqual(pack.quiz[0], {
    question: "Quando o farol acende?",
    options: question().options,
    correct: 0,
    line: 1,
  });
  assert.deepEqual(pack.thumbnail, { file: "Aula 3.jpg", time: 12, title: "Farol" });
  assert.deepEqual(pack.video, {
    file: "Aula 3.mp4",
    sha256: "ab".repeat(32),
    seconds: 61.23,
    width: 1920,
    height: 1080,
  });
  assert.equal(pack.createdAt, "2026-10-18T12:00:00.000Z");
  assert.equal(pack.captions.length, 2);
});

test("buildPlatformPackage leaves invalid chapters out and says why", () => {
  const pack = buildPlatformPackage(
    { lesson: "Aula", chapters: [{ time: 5, title: "Começo" }] },
    {
      video: "Aula.mp4",
      sha256: "0",
      seconds: 30,
      width: 2,
      height: 2,
      captions: [],
      now: new Date(0),
    },
  );
  assert.deepEqual(pack.chapters, []);
  assert.ok(pack.chapterProblems?.some((p) => /0:00/.test(p)));
  assert.equal(pack.thumbnail, undefined);
});

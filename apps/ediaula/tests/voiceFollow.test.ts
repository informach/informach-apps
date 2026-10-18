import assert from "node:assert/strict";
import { test } from "node:test";
import { ClipMeter, micCheck } from "../src/shared/recordingHealth.ts";
import {
  FOLLOW_RATE,
  FollowWindow,
  isWhisperServer,
  lineDoneAt,
  lineEndAt,
  lineEndHeard,
  serverWords,
  wavBytes,
} from "../src/shared/voiceFollow.ts";
import { readLines, stepLine, voiceSpeakers } from "../src/shared/voiceTakes.ts";

test("a fala acaba quando as últimas palavras dela são ouvidas", () => {
  const line = "Primeiro, abra a plataforma e clique no botão verde.";
  assert.equal(lineEndHeard(line, " Primeiro, abra a plataforma e clique no botão verde."), true);
  // Whisper's spelling and a word left out still count.
  assert.equal(lineEndHeard(line, "e clica no botao verdi"), true);
  assert.equal(lineEndHeard(line, "abra a plataforma e clique"), false);
  assert.equal(lineEndHeard(line, "verde"), false, "a palavra sozinha, sem o que vem antes");
  assert.equal(lineEndHeard("Tchau!", "e é isso, tchau"), true);
  assert.equal(lineEndHeard("Temos 3 desafios.", "nós temos três desafios"), true);
});

test("a janela do microfone só ouve a fala da tela, de 4 a 6 s, e descarta o atrasado", () => {
  const w = new FollowWindow();
  const second = new Int16Array(FOLLOW_RATE).fill(1000);
  w.push(second, 1000);
  w.push(second, 2000);
  // Still the previous line: two seconds of it.
  assert.equal(w.take()?.samples.length, 2 * FOLLOW_RATE);
  w.newLine(2000);
  // Under a second of the new line: nothing yet.
  assert.equal(w.take(), null);
  for (let t = 3000; t <= 9000; t += 1000) w.push(second, t);
  const stretch = w.take();
  // Never more than six seconds, the newest ones.
  assert.equal(stretch?.samples.length, 6 * FOLLOW_RATE);
  assert.equal(stretch?.end, 9000);
  assert.equal(stretch?.start, 3000, "o trecho sabe quando começou");
  assert.equal(stretch?.line, 2000);
  const wav = wavBytes(new Int16Array([1, -1]));
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(wav.length, 48);
});

test("as falas gravadas são as dos locutores escolhidos, sem o Zappy", () => {
  const lines = [
    { speaker: "Professora", text: "Oi!", avatar: false },
    { speaker: "Zappy", text: "Bip!", avatar: false },
    { speaker: "Debinha", text: "Vamos lá.", avatar: true, insertId: "F1P1-D01" },
    { speaker: "Professora", text: "Tchau.", avatar: false },
  ];
  assert.deepEqual(voiceSpeakers(lines), [
    { name: "Professora", on: true },
    { name: "Zappy", on: false },
    { name: "Debinha", on: true },
  ]);
  const order = readLines(lines, new Set(["Professora", "Debinha", "Zappy"]));
  assert.deepEqual(order, [0, 2, 3]);
  assert.equal(stepLine(order, 0, 1), 2);
  assert.equal(stepLine(order, 3, 1), 3);
  assert.equal(stepLine(order, 1, -1), 0);
});

test("teste de 5 s do microfone e aviso de voz estourando", () => {
  const quiet = Array.from({ length: 10 }, () => ({ rms: 0.0005, peak: 0.002 }));
  const voice = (rms: number, peak: number) => Array.from({ length: 30 }, () => ({ rms, peak }));
  assert.equal(micCheck([...quiet, ...voice(0.1, 0.5)]).ok, true);
  assert.match(micCheck([...quiet, ...voice(0.008, 0.03)]).advice, /aproxime-se/);
  assert.match(micCheck([...quiet, ...voice(0.3, 1)]).advice, /afaste-se/);
  const noisy = Array.from({ length: 10 }, () => ({ rms: 0.006, peak: 0.02 }));
  assert.match(micCheck([...noisy, ...voice(0.1, 0.5)]).advice, /ruído/);
  const clip = new ClipMeter();
  assert.equal(clip.add(0.99, 0.1), true);
  assert.equal(clip.add(0.5, 1), true);
  assert.equal(clip.add(0.5, 1.5), false);
});

test("o fim da fala é o fim da última palavra, e só conta o que veio depois da fala aparecer", () => {
  // whisper-server's tokens: a token without a leading space belongs to the word before it.
  const json = {
    segments: [
      {
        words: [
          { word: " abra", start: 0.2, end: 0.5 },
          { word: " a", start: 0.5, end: 0.6 },
          { word: " plata", start: 0.6, end: 0.9 },
          { word: "forma", start: 0.9, end: 1.3 },
          { word: " ", start: 1.3, end: 1.3 },
          { word: " agora", start: 2.1, end: 2.4 },
          { word: " clique", start: 2.5, end: 2.8 },
          { word: " no", start: 2.8, end: 2.9 },
          { word: " botão", start: 2.9, end: 3.3 },
          { word: " verde.", start: 3.3, end: 3.9 },
        ],
      },
    ],
  };
  const words = serverWords(json);
  assert.deepEqual(
    words.map((w) => w.text),
    ["abra", "a", "plataforma", "agora", "clique", "no", "botão", "verde."],
  );
  assert.equal(words[2].end, 1.3);
  assert.equal(serverWords({ nada: 1 }).length, 0);
  assert.equal(lineEndAt("Agora clique no botão verde.", words), 3.9);
  assert.equal(lineEndAt("Abra a plataforma.", words), 1.3);
  // The stretch starts at QPC 10000; "Abra a plataforma." went on screen at 10100, so it was
  // heard ending at 11300.
  assert.equal(lineDoneAt("Abra a plataforma.", words, 10000, 10100), 11300);
  // The same words heard before the line appeared (it came up at 12000) are the line before.
  assert.equal(lineDoneAt("Abra a plataforma.", words, 10000, 12000), null);
  assert.equal(lineDoneAt("Agora clique no botão verde.", words, 10000, 12000), 13900);
});

test("o microfone só vai para o whisper-server, nunca para outro programa na porta", () => {
  assert.equal(isWhisperServer("whisper.cpp", ""), true);
  assert.equal(
    isWhisperServer(null, "<html><head><title>Whisper.cpp Server</title></head></html>"),
    true,
  );
  assert.equal(isWhisperServer("nginx", "<title>Bem-vindo</title>"), false);
  assert.equal(isWhisperServer(null, ""), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { retakeCutsFromWords, type TakeWord } from "../src/shared/recording.ts";

/** Words one after another from `start`, each `length` seconds with `gap` between them. */
function said(text: string, start: number, length = 0.3, gap = 0.08): TakeWord[] {
  return text.split(" ").map((word, i) => ({
    start: start + i * (length + gap),
    end: start + i * (length + gap) + length,
    text: word,
  }));
}

test("Ctrl+R by the words: from where the passage said again was first said", () => {
  const words = [
    ...said("Vamos abrir o jogo.", 0),
    // The flub: "Agora clique no botão verd...", then the press and the passage again.
    ...said("Agora clique no botão verde", 2),
    ...said("Agora clique no botão azul.", 5),
  ];
  const cuts = retakeCutsFromWords([{ t: 4.6, kind: "retake" }], words);
  assert.equal(cuts.length, 1);
  const [start, end] = cuts[0];
  // From just before the first "Agora" to just before the second one.
  assert.ok(start > words[3].end && start < 2, `start ${start}`);
  assert.ok(end > words[8].end && end < 5, `end ${end}`);
});

test("without the repeated words, the cut starts at the sentence the press interrupted", () => {
  const words = [
    ...said("Primeiro a gente liga o farol.", 0),
    ...said("Depois o barco anda até", 3),
    ...said("Agora o barco vai até a costa.", 6),
  ];
  const cuts = retakeCutsFromWords([{ t: 5.4, kind: "retake" }], words);
  assert.equal(cuts.length, 1);
  const [start, end] = cuts[0];
  // "Depois" opens the sentence after "farol."
  assert.ok(Math.abs(start - (3 - 0.15)) < 0.16, `start ${start}`);
  assert.ok(end < 6 && end > 5.6, `end ${end}`);
});

test("a long silence also ends a sentence; markers that are not Ctrl+R are left alone", () => {
  const words = [...said("e aqui fica o farol", 0), ...said("e o barco chega", 4.2)];
  const cuts = retakeCutsFromWords(
    [
      { t: 3, kind: "marker" },
      { t: 8, kind: "retake" },
    ],
    words,
  );
  // After the press at 8 s nothing was said: no cut.
  assert.deepEqual(cuts, []);
  const again = [...words, ...said("e o barco chega na costa", 9)];
  const [[start, end]] = retakeCutsFromWords([{ t: 8, kind: "retake" }], again);
  assert.ok(start > 1.8 && start < 4.2, `start ${start}`);
  assert.ok(end > 8 && end < 9, `end ${end}`);
});

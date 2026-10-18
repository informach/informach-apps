import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPTION_LINE,
  fitLines,
  parseTranslation,
  type SourceCue,
  staleCues,
  TRANSLATION_BATCH,
  translateCues,
  translatedCues,
} from "../src/shared/captionTranslate.ts";

const cues = (n: number): SourceCue[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `voz:${i * 3}`,
    start: i * 2,
    end: i * 2 + 1.5,
    text: `Legenda número ${i}`,
  }));

/** A fake engine: answers each batch with the captions it was sent, "translated". */
function engine(mangle?: (cues: { i: number; text: string }[], call: number) => unknown) {
  const prompts: string[] = [];
  const run = async (prompt: string): Promise<string> => {
    prompts.push(prompt);
    const sent = JSON.parse(prompt.slice(prompt.lastIndexOf('{"cues"')).split("\n")[0]) as {
      cues: { i: number; text: string }[];
    };
    const out = sent.cues.map((c) => ({ i: c.i, text: `EN ${c.text}` }));
    return JSON.stringify({ cues: mangle ? mangle(out, prompts.length) : out });
  };
  return { run, prompts };
}

test("fitLines keeps answers that fit and rewraps the ones that can fit in 2 lines of 42", () => {
  assert.equal(fitLines("Hello there\nfriend"), "Hello there\nfriend");
  const long = "This sentence is a little too long to stay in a single caption line";
  const fit = fitLines(long);
  assert.ok(fit);
  assert.ok(fit.split("\n").every((l) => l.length <= CAPTION_LINE));
  assert.equal(fit.split("\n").length, 2);
  assert.equal(fitLines("word ".repeat(30)), null);
  assert.equal(fitLines("x".repeat(43)), null);
  assert.equal(fitLines("  \n "), null);
});

test("parseTranslation checks the count, the order and the size of every caption", () => {
  assert.deepEqual(parseTranslation('{"cues":[{"i":0,"text":"Hi"},{"i":1,"text":"Bye"}]}', 2), {
    ok: true,
    texts: ["Hi", "Bye"],
  });
  assert.match(
    (parseTranslation('{"cues":[{"i":0,"text":"Hi"}]}', 2) as { error: string }).error,
    /Vieram 1 legendas, mas eram 2/,
  );
  assert.match(
    (
      parseTranslation('{"cues":[{"i":1,"text":"Hi"},{"i":0,"text":"Bye"}]}', 2) as {
        error: string;
      }
    ).error,
    /fora de ordem/,
  );
  assert.match(
    (parseTranslation(`{"cues":[{"i":0,"text":"${"word ".repeat(30)}"}]}`, 1) as { error: string })
      .error,
    /passa de 2 linhas de 42 caracteres/,
  );
  assert.match((parseTranslation("no json here", 1) as { error: string }).error, /não trouxe JSON/);
});

test("translateCues sends 150 captions per batch and keeps each by its key and text", async () => {
  const source = cues(320);
  const fake = engine();
  const batches: number[] = [];
  const out = await translateCues(source, "en", fake.run, {
    onBatch: (done, total) => batches.push(done * 100 + total),
  });
  assert.equal(fake.prompts.length, 3);
  assert.deepEqual(batches, [103, 203, 303]);
  assert.match(fake.prompts[0], /"en"/);
  assert.match(
    fake.prompts[0],
    new RegExp(`keep the same number of captions \\(${TRANSLATION_BATCH}\\)`),
  );
  assert.equal(out.length, 320);
  assert.deepEqual(out[200], {
    key: "voz:600",
    source: "Legenda número 200",
    text: "EN Legenda número 200",
  });
});

test("a batch with the wrong count is asked again with the reason; three refusals stop it", async () => {
  // The second batch drops a caption the first time it is asked.
  const fake = engine((list, call) => (call === 2 ? list.slice(1) : list));
  const out = await translateCues(cues(200), "es", fake.run);
  assert.equal(fake.prompts.length, 3);
  assert.match(fake.prompts[2], /refused: Vieram 49 legendas, mas eram 50/);
  assert.equal(out.length, 200);

  const never = engine((list) => list.slice(1));
  await assert.rejects(
    translateCues(cues(10), "fr", never.run),
    /lote 1 de 1 não passou na conferência: Vieram 9 legendas, mas eram 10/,
  );
  assert.equal(never.prompts.length, 3);
  await assert.rejects(translateCues(cues(1), "english", never.run), /Idioma inválido/);
});

test("the translation goes out only while every caption of now has its current text translated", () => {
  const now = cues(3);
  const translation = {
    lang: "en",
    createdAt: 0,
    cues: now.map((c) => ({ key: c.key, source: c.text, text: `EN ${c.text}` })),
  };
  assert.deepEqual(
    translatedCues(now, translation)?.map((c) => [c.start, c.text]),
    [
      [0, "EN Legenda número 0"],
      [2, "EN Legenda número 1"],
      [4, "EN Legenda número 2"],
    ],
  );
  assert.equal(staleCues(now, translation), 0);
  // The second caption was edited after translating: the files wait for a new translation.
  const edited = now.map((c, i) => (i === 1 ? { ...c, text: "Outro texto" } : c));
  assert.equal(translatedCues(edited, translation), null);
  assert.equal(staleCues(edited, translation), 1);
  // Times follow the lesson of now.
  const moved = now.map((c) => ({ ...c, start: c.start + 10, end: c.end + 10 }));
  assert.equal(translatedCues(moved, translation)?.[0].start, 10);
});

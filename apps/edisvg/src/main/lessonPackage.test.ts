import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { zipSync } from "fflate";
import { packageLesson, unpackLesson } from "./lessonPackage.ts";

/**
 * EdiAula's package of a lesson, as Arquivo › Empacotar a aula writes it: the lesson pointing at
 * media/<name>, the narration, the page's sound and the screen of a guided take, its cursor.
 */
const lesson = {
  version: 1,
  name: "Desafio, aula 1",
  assets: [
    {
      id: "tela",
      path: "media/t1-tela.mp4",
      kind: "video",
      hasVideo: true,
      hasAudio: false,
      width: 1920,
      height: 1080,
      cursor: "media/t1-cursor.json",
      guidedRun: "media/t1-guided-run.json",
      recording: { role: "screen" },
    },
    {
      id: "voz",
      path: "media/v1-narracao.wav",
      kind: "audio",
      hasAudio: true,
      transcript: "media/v1-narracao-transcricao.json",
      transcriptStatus: "ready",
      recording: { role: "narration" },
    },
    {
      id: "pagina",
      path: "media/p1-som-da-pagina.wav",
      kind: "audio",
      hasAudio: true,
      recording: { role: "system" },
    },
    // Not on the timeline: not taken out.
    { id: "sobra", path: "media/s1-sobra.wav", kind: "audio", hasAudio: true },
    // On the music track: never heard as voice, so not taken out.
    { id: "musica", path: "media/m1-musica.wav", kind: "audio", hasAudio: true },
    // A voice the package did not bring: given its place in the folder (not there).
    { id: "falta", path: "media/f1-falta.wav", kind: "audio", hasAudio: true },
    // A name that leaves media/ is never written anywhere.
    { id: "fuga", path: "media/../../fora.wav", kind: "audio", hasAudio: true },
  ],
  tracks: [
    { id: "v", kind: "video", name: "Faixa 1" },
    { id: "n", kind: "audio", name: "Narração guiada" },
    { id: "s", kind: "audio", name: "Som da página" },
    { id: "m", kind: "audio", name: "Música", music: true },
  ],
  clips: [
    { assetId: "tela", trackId: "v", start: 0, in: 0, duration: 10 },
    { assetId: "voz", trackId: "n", start: 0, in: 0, duration: 10 },
    { assetId: "pagina", trackId: "s", start: 0, in: 0, duration: 10 },
    { assetId: "fuga", trackId: "n", start: 20, in: 0, duration: 1 },
    { assetId: "musica", trackId: "m", start: 0, in: 0, duration: 10 },
    { assetId: "falta", trackId: "n", start: 30, in: 0, duration: 2 },
  ],
};

const bytes = (text: string) => new TextEncoder().encode(text);
const files = {
  "aula.ediaula": bytes(JSON.stringify(lesson)),
  "media/t1-tela.mp4": bytes("tela".repeat(1000)),
  "media/t1-cursor.json": bytes(JSON.stringify({ width: 1920, height: 1080, clicks: [] })),
  "media/t1-guided-run.json": bytes("{}"),
  "media/v1-narracao.wav": bytes("voz".repeat(1000)),
  "media/v1-narracao-transcricao.json": bytes(JSON.stringify({ words: [] })),
  "media/p1-som-da-pagina.wav": bytes("pagina".repeat(1000)),
  "media/s1-sobra.wav": bytes("sobra"),
  "media/m1-musica.wav": bytes("musica"),
  "fora.wav": bytes("fora"),
};

let dir = "";
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "edisvg-pacote-"));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test("a lesson package gives the lesson with only what a run uses, at absolute paths", async () => {
  // As EdiAula stores it (no compression), and as a ZIP made again elsewhere (deflated).
  for (const [name, level] of [
    ["guardado.zip", 0],
    ["comprimido.zip", 6],
  ] as const) {
    const zip = join(dir, name);
    await writeFile(zip, zipSync(files, { level }));
    const root = join(dir, `pacotes-${level}`);
    const path = await unpackLesson(zip, root);
    const folder = join(path, "..");
    const unpacked = JSON.parse(await readFile(path, "utf8")) as typeof lesson;
    const asset = (id: string) => unpacked.assets.find((a) => a.id === id);
    assert.equal(asset("tela")?.path, join(folder, "media", "t1-tela.mp4"));
    assert.equal(asset("tela")?.cursor, join(folder, "media", "t1-cursor.json"));
    assert.equal(asset("voz")?.path, join(folder, "media", "v1-narracao.wav"));
    assert.equal(asset("voz")?.transcript, join(folder, "media", "v1-narracao-transcricao.json"));
    assert.equal(
      await readFile(join(folder, "media", "v1-narracao.wav"), "utf8"),
      "voz".repeat(1000),
    );
    // The page's sound, what is off the timeline and what would leave media/ stay in the ZIP.
    assert.equal(asset("pagina")?.path, "media/p1-som-da-pagina.wav");
    assert.equal(asset("sobra")?.path, "media/s1-sobra.wav");
    assert.equal(asset("fuga")?.path, "media/../../fora.wav");
    assert.equal(asset("musica")?.path, "media/m1-musica.wav");
    // The missing voice points at its place here, which is not there: the run names it.
    assert.equal(asset("falta")?.path, join(folder, "media", "f1-falta.wav"));
    assert.equal(existsSync(join(folder, "media", "f1-falta.wav")), false);
    assert.deepEqual((await readdir(join(folder, "media"))).sort(), [
      "t1-cursor.json",
      "t1-tela.mp4",
      "v1-narracao-transcricao.json",
      "v1-narracao.wav",
    ]);
    assert.equal(existsSync(join(dir, "fora.wav")), false);
    // Everything else in the lesson is kept as it was.
    assert.equal((unpacked as { name?: string }).name, "Desafio, aula 1");

    // The same package again: the folder is used as it is, nothing unpacked twice.
    const written = (await stat(path)).mtimeMs;
    assert.equal(await unpackLesson(zip, root), path);
    assert.equal((await stat(path)).mtimeMs, written);
  }
});

test("only the newest packages stay unpacked", async () => {
  const root = join(dir, "varios");
  const made: string[] = [];
  for (let i = 0; i < 4; i++) {
    const zip = join(dir, `aula-${i}.zip`);
    await writeFile(zip, zipSync(files, { level: 0 }));
    made.push(join(await unpackLesson(zip, root), ".."));
    // Distinct times for the folders (the newest are kept).
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const left = (await readdir(root)).map((name) => join(root, name)).sort();
  assert.deepEqual(left, made.slice(-3).sort());
});

test("a ZIP that is not a lesson package says so, and leaves nothing behind", async () => {
  const root = join(dir, "recusados");
  await mkdir(root, { recursive: true });
  const other = join(dir, "fotos.zip");
  await writeFile(other, zipSync({ "foto.png": bytes("png") }, { level: 0 }));
  await assert.rejects(unpackLesson(other, root), /falta a aula \(aula\.ediaula\)/);
  const broken = join(dir, "quebrado.zip");
  await writeFile(broken, bytes("isto não é um zip"));
  await assert.rejects(unpackLesson(broken, root), /não é um pacote de aula/);
  const notLesson = join(dir, "nao-aula.zip");
  await writeFile(notLesson, zipSync({ "aula.ediaula": bytes("{}") }, { level: 0 }));
  await assert.rejects(unpackLesson(notLesson, root), /não é uma aula do EdiAula/);
  assert.deepEqual(await readdir(root), []);
});

test("the package's lesson is read without unpacking: its id, its script and this lesson's section", async () => {
  const withScript = join(dir, "com-roteiro.zip");
  await writeFile(
    withScript,
    zipSync(
      {
        ...files,
        "aula.ediaula": bytes(
          JSON.stringify({
            ...lesson,
            id: "pgte1jhfsnary",
            script: { text: "## Parte 1. A\n\nOi.", section: 2 },
          }),
        ),
      },
      { level: 6 },
    ),
  );
  assert.deepEqual(await packageLesson(withScript), {
    id: "pgte1jhfsnary",
    script: { text: "## Parte 1. A\n\nOi.", section: 2 },
  });
  // No section: the script is the lesson's one section.
  const single = join(dir, "uma-secao.zip");
  await writeFile(
    single,
    zipSync({ "aula.ediaula": bytes(JSON.stringify({ ...lesson, script: { text: "Oi." } })) }),
  );
  assert.deepEqual(await packageLesson(single), { id: null, script: { text: "Oi.", section: 0 } });
  // No script (or an empty one): the person writes the roteiro. An id that is not EdiAula's: none.
  const none = join(dir, "sem-roteiro.zip");
  await writeFile(
    none,
    zipSync({ "aula.ediaula": bytes(JSON.stringify({ ...lesson, id: "../fora" })) }),
  );
  assert.deepEqual(await packageLesson(none), { id: null, script: null });
  const other = join(dir, "fotos-roteiro.zip");
  await writeFile(other, zipSync({ "foto.png": bytes("png") }));
  await assert.rejects(packageLesson(other), /falta a aula/);
  const notLesson = join(dir, "nao-aula-roteiro.zip");
  await writeFile(notLesson, zipSync({ "aula.ediaula": bytes("[1]") }));
  await assert.rejects(packageLesson(notLesson), /não é uma aula do EdiAula/);
});

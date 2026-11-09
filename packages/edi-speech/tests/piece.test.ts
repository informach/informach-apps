import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findScriptPiece, type HeardWord, PieceNotFoundError } from "../src/piece.ts";

/** Real whisper words (pt, model small) of a synthesized narration about the lighthouse game. */
const scene: HeardWord[] = JSON.parse(
  readFileSync(new URL("./fixtures/farol-words.json", import.meta.url), "utf8"),
).words;

/** Talk that is not the scene, sharing many of its words (farol, chave, bloco, personagem…). */
const OTHER = (
  "Na aula passada vimos como o farol funciona e por que o barco precisa de luz. " +
  "A chave do jogo de hoje é diferente: o personagem não anda sozinho, quem manda é o bloco. " +
  "Antes de continuar, salve o seu projeto e confira se a programação está igual à minha. " +
  "Se aparecer um aviso vermelho, volte um passo e arraste de novo. Agora vamos para a praia."
).split(" ");

/** A lesson: other talk, the scene shifted to 120 s, more other talk; one word every 0.4 s. */
function lesson(): HeardWord[] {
  const out: HeardWord[] = [];
  let t = 0;
  for (let round = 0; round < 3; round++)
    for (const text of OTHER) {
      out.push({ text, start: t, end: t + 0.3, p: 0.9 });
      t += 0.4;
    }
  const shift = 120;
  for (const w of scene) out.push({ ...w, start: w.start + shift, end: w.end + shift });
  t = scene.at(-1)!.end + shift + 1;
  for (let round = 0; round < 3; round++)
    for (const text of OTHER) {
      out.push({ text, start: t, end: t + 0.3, p: 0.9 });
      t += 0.4;
    }
  return out;
}

describe("findScriptPiece", () => {
  it("finds a scene's sentences in the whole lesson, at the times they are said", () => {
    const piece = findScriptPiece(
      lesson(),
      "Depois, arraste o bloco de variáveis para o começo do programa. O personagem precisa " +
        "encontrar a chave antes de chegar ao farol. Quando ele pegar a chave, o aviso muda.",
    );
    expect(piece.lines.map((l) => l.text)).toEqual([
      "Depois, arraste o bloco de variáveis para o começo do programa.",
      "O personagem precisa encontrar a chave antes de chegar ao farol.",
      "Quando ele pegar a chave, o aviso muda.",
    ]);
    // "depois," at 10.36 s and "muda." at 24.43–24.9 s of the scene, which starts at 120 s.
    expect(piece.lines[0]!.start).toBeCloseTo(130.36, 1);
    expect(piece.lines[1]!.start).toBeCloseTo(135.98, 1);
    expect(piece.lines[2]!.start).toBeCloseTo(141.79, 1);
    expect(piece.start).toBeCloseTo(130.36, 1);
    expect(piece.end).toBeGreaterThan(144.4);
    expect(piece.end).toBeLessThan(145.5);
    expect(piece.coverage).toBeGreaterThan(0.9);
  });

  it('takes what whisper heard differently ("por enfim" for "por fim")', () => {
    const piece = findScriptPiece(lesson(), "Por fim, o farol acende e o barco chega na praia.");
    expect(piece.lines).toHaveLength(1);
    expect(piece.start).toBeCloseTo(145.83, 1);
  });

  it("names the sentence it did not hear, and never guesses a time", () => {
    try {
      findScriptPiece(
        lesson(),
        "Primeiro, abra a aba de programação. Agora pinte o céu de roxo com o balde de tinta.",
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PieceNotFoundError);
      expect((error as PieceNotFoundError).missing).toEqual([
        "Agora pinte o céu de roxo com o balde de tinta.",
      ]);
      expect((error as Error).message).toBe(
        'Não achei no áudio a frase: "Agora pinte o céu de roxo com o balde de tinta.".',
      );
    }
  });

  it("says when the script is not in the recording at all", () => {
    expect(() =>
      findScriptPiece(lesson(), "A fotossíntese transforma luz em energia química nas folhas."),
    ).toThrow("Não achei esse roteiro no áudio.");
    expect(() => findScriptPiece([], "Uma frase.")).toThrow("Não achei esse roteiro no áudio.");
  });
});

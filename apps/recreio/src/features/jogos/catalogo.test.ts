import { JOGOS, jogoPorId } from "@informach/config/jogos";
import { describe, expect, it } from "vitest";
import { catalogoDosJogos, JOGO_DE_TESTE, JOGO_DE_TESTE_ID, manifestoNoCatalogo } from "./catalogo";

describe("catálogo do deploy", () => {
  it("sem a opção, o jogo de teste não existe", () => {
    expect(catalogoDosJogos(false)).toBe(JOGOS);
    expect(manifestoNoCatalogo(JOGO_DE_TESTE_ID, false)).toBeNull();
    expect(manifestoNoCatalogo("morada", false)).toBe(jogoPorId("morada"));
    expect(manifestoNoCatalogo("nao-existe", false)).toBeNull();
  });

  it("com a opção, ele entra por último e os jogos públicos continuam os mesmos", () => {
    expect(catalogoDosJogos(true)).toEqual([...JOGOS, JOGO_DE_TESTE]);
    expect(manifestoNoCatalogo(JOGO_DE_TESTE_ID, true)).toBe(JOGO_DE_TESTE);
    expect(manifestoNoCatalogo("morada", true)).toBe(jogoPorId("morada"));
    expect(manifestoNoCatalogo("nao-existe", true)).toBeNull();
  });

  it("o jogo de teste não está no catálogo público nem toma o id de um jogo de verdade", () => {
    expect(jogoPorId(JOGO_DE_TESTE_ID)).toBeNull();
    expect(JOGOS.map((jogo) => jogo.id as string)).not.toContain(JOGO_DE_TESTE_ID);
    expect(JOGO_DE_TESTE.rota).toBe(`/jogar/${JOGO_DE_TESTE_ID}`);
    // `interno` abre (não é `em_breve`, `manutencao` nem `aposentado`), mas não é estado de lançamento.
    expect(JOGO_DE_TESTE.estado).toBe("interno");
  });
});

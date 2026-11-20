import { JOGOS, jogoPorId } from "@informach/config/jogos";
import { describe, expect, it } from "vitest";
import {
  catalogoDosJogos,
  JOGO_DE_CARGA,
  JOGO_DE_CARGA_ID,
  JOGO_DE_PERFIL,
  JOGO_DE_PERFIL_ID,
  JOGO_DE_TESTE,
  JOGO_DE_TESTE_ID,
  manifestoNoCatalogo,
} from "./catalogo";

describe("catálogo do deploy", () => {
  it("sem a opção, o jogo de teste não existe", () => {
    expect(catalogoDosJogos(false)).toBe(JOGOS);
    expect(manifestoNoCatalogo(JOGO_DE_TESTE_ID, false)).toBeNull();
    expect(manifestoNoCatalogo(JOGO_DE_PERFIL_ID, false)).toBeNull();
    expect(manifestoNoCatalogo(JOGO_DE_CARGA_ID, false)).toBeNull();
    expect(manifestoNoCatalogo("morada", false)).toBe(jogoPorId("morada"));
    expect(manifestoNoCatalogo("nao-existe", false)).toBeNull();
  });

  it("com a opção, ele entra por último e os jogos públicos continuam os mesmos", () => {
    expect(catalogoDosJogos(true)).toEqual([
      ...JOGOS,
      JOGO_DE_TESTE,
      JOGO_DE_PERFIL,
      JOGO_DE_CARGA,
    ]);
    expect(manifestoNoCatalogo(JOGO_DE_CARGA_ID, true)).toBe(JOGO_DE_CARGA);
    expect(JOGO_DE_CARGA.capacidades.mundos?.membrosMax).toBe(8);
    expect(JOGO_DE_TESTE.capacidades.mundos?.membrosMax).toBe(4);
    expect(jogoPorId(JOGO_DE_CARGA_ID)).toBeNull();
    expect(manifestoNoCatalogo(JOGO_DE_PERFIL_ID, true)).toBe(JOGO_DE_PERFIL);
    expect(JOGO_DE_PERFIL.capacidades.mundos).toBeNull();
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

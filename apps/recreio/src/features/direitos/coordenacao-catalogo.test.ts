import { describe, expect, it } from "vitest";
import { JOGO_DE_TESTE } from "@/features/jogos/catalogo";
import { fixtureDoLivro } from "../../../test/livro-apoio";
import { criarBucketDoLivro } from "../../../test/livro-s3-apoio";
import { resolverLimitesDaCoordenacao } from "./coordenacao-repository";
import { criarArmazenamentoDoLivro } from "./livro/armazenamento";
import { conferirPrefixoDoLivro } from "./livro/leitura";

describe("contrato de formato na retirada", () => {
  it("resolve um título interno conhecido sem carregar configuração web ou abrir jogo", async () => {
    const livro = fixtureDoLivro(),
      http = await criarBucketDoLivro();
    try {
      const storage = criarArmazenamentoDoLivro({
        cliente: http.cliente,
        bucket: "recreio-fixture",
        assinatura: livro.assinatura,
        tempoLimiteMs: 2000,
      });
      await storage.iniciarCabecalho(livro.assinatura.assinarCabecalho(livro.inicial));
      const limites = await resolverLimitesDaCoordenacao({
        assinatura: livro.assinatura,
        prova: await conferirPrefixoDoLivro({ storage, maxEntradas: 0, tempoLimiteMs: 2000 }),
      });
      expect(limites(JOGO_DE_TESTE.id)).toEqual(JOGO_DE_TESTE.limites);
      expect(() => limites("titulo-desconhecido")).toThrowError(
        expect.objectContaining({ codigo: "JOGO_INDISPONIVEL" }),
      );
    } finally {
      livro.encerrar();
      await http.fechar();
    }
  });
});

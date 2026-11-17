import { FECHAMENTO } from "@informach/morada-sim/protocolo";
import { ErroDoRecreio } from "@informach/recreio";
import { describe, expect, it, vi } from "vitest";
import { criarBancada } from "./apoio";

describe("resultado do desligamento de vários mundos", () => {
  it("salva os demais mundos se a fotografia de um falha, conserva a posse e o resultado na repetição", async () => {
    const bancada = await criarBancada();
    const { instancia, host } = await bancada.novaInstancia();
    const ana = bancada.jogador("Ana"),
      bia = bancada.jogador("Bia");
    const a = bancada.criarMundo(ana),
      b = bancada.criarMundo(bia);
    await bancada.entrar(ana, a);
    await bancada.entrar(bia, b);
    const fotosAntes = bancada.plataforma.mundo(a).fotografias.length;
    const gravar = host.gravarFotografia.bind(host);
    const escrita = vi.spyOn(host, "gravarFotografia").mockImplementation(async (pedido) => {
      if (pedido.mundoId === a) throw new ErroDoRecreio("INDISPONIVEL");
      return gravar(pedido);
    });
    try {
      const primeira = instancia.encerrar(),
        repetida = instancia.encerrar();
      expect(repetida).toBe(primeira);
      expect(await primeira).toEqual({ mundos: 2, falhas: 1 });
      expect(await instancia.encerrar()).toEqual({ mundos: 2, falhas: 1 });
      expect(bancada.plataforma.mundo(a).posse).not.toBeNull();
      expect(bancada.plataforma.mundo(a).fotografias).toHaveLength(fotosAntes);
      const salvo = bancada.plataforma.mundo(b);
      expect(salvo.posse).toBeNull();
      expect(salvo.fotografias.at(-1)?.diarioSeq).toBe(salvo.diarioSeq);
      expect(ana.fechamento).toBe(FECHAMENTO.reiniciando);
      expect(bia.fechamento).toBe(FECHAMENTO.reiniciando);
      expect(instancia.medir()).toMatchObject({ viva: false, drenando: true, conexoes: 0 });
    } finally {
      escrita.mockRestore();
    }
  });
});

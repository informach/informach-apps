import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixtureDoLivro } from "../../../../test/livro-apoio";
import { criarBucketDoLivro } from "../../../../test/livro-s3-apoio";
import { criarArmazenamentoDoLivro } from "./armazenamento";
import { criarAssinaturaDoLivro, resumoDoRegistro } from "./assinatura";
import { conferirPrefixoDoLivro, reaplicarLivroCongelado } from "./leitura";

async function cenario(fn: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>) {
  const f = await preparar();
  try {
    await fn(f);
  } finally {
    f.encerrar();
    await f.http.fechar();
  }
}
async function preparar() {
  const f = fixtureDoLivro(),
    http = await criarBucketDoLivro(),
    storage = criarArmazenamentoDoLivro({
      cliente: http.cliente,
      bucket: "recreio-fixture",
      assinatura: f.assinatura,
      tempoLimiteMs: 2000,
    });
  return {
    ...f,
    http,
    storage,
    async admitir() {
      const base = await storage.iniciarCabecalho(f.assinatura.assinarCabecalho(f.inicial)),
        doc = f.intencao(),
        bytes = f.assinatura.assinarIntencao(doc);
      await storage.publicarIntencao(bytes);
      const head = await storage.trocarCabecalho(
        base,
        f.assinatura.assinarCabecalho(f.proximo(base, bytes)),
      );
      return { doc, head };
    },
  };
}
const limites = { maxEntradas: 10, tempoLimiteMs: 10_000 };
describe("continuidade do livro externo", () => {
  it("confere o prefixo aberto sem autorizar replay de recuperação", async () =>
    cenario(async (f) => {
      const { head } = await f.admitir(),
        p = await conferirPrefixoDoLivro({ ...limites, storage: f.storage });
      expect(p.cabecalho.sha256).toBe(head.sha256);
      expect(p.referencias).toHaveLength(1);
      let chamadas = 0;
      await expect(
        reaplicarLivroCongelado({
          ...limites,
          storage: f.storage,
          aplicar: async () => {
            chamadas++;
          },
        }),
      ).rejects.toMatchObject({ codigo: "CONFIGURACAO" });
      expect(chamadas).toBe(0);
    }));
  it("verifica a cadeia inteira e reaplica somente intenções admitidas", async () =>
    cenario(async (f) => {
      const { head, doc } = await f.admitir();
      // Registro preparado que perdeu o CAS não comprova efeitos concluídos.
      await f.storage.publicarIntencao(f.assinatura.assinarIntencao(f.intencao()));
      await f.storage.congelarCabecalho(head, "2026-11-19T10:02:00.000Z");
      const recebidas: string[] = [];
      const r = await reaplicarLivroCongelado({
        ...limites,
        storage: f.storage,
        aplicar: async (i, c) => {
          expect(c.sequencia).toBe(1);
          expect(c.signal.aborted).toBe(false);
          recebidas.push(i.operacaoId);
        },
      });
      expect(recebidas).toEqual([doc.operacaoId]);
      expect(r).toMatchObject({ geracao: 2, entradasReaplicadas: 1, congelado: true });
    }));
  it("histórico ausente impede todos os efeitos, inclusive os já lidos", async () =>
    cenario(async (f) => {
      const { head } = await f.admitir();
      await f.storage.congelarCabecalho(head, "2026-11-19T10:02:00.000Z");
      for (const key of f.http.objetos.keys())
        if (key.includes("/historico/0000000000000000-")) f.http.objetos.delete(key);
      let chamadas = 0;
      await expect(
        reaplicarLivroCongelado({
          ...limites,
          storage: f.storage,
          aplicar: async () => {
            chamadas++;
          },
        }),
      ).rejects.toMatchObject({ codigo: "AUSENTE" });
      expect(chamadas).toBe(0);
    }));
  it("recusa limite excedido sem truncar nem executar consumidor", async () =>
    cenario(async (f) => {
      const { head } = await f.admitir();
      await f.storage.congelarCabecalho(head, "2026-11-19T10:02:00.000Z");
      let chamadas = 0;
      await expect(
        reaplicarLivroCongelado({
          ...limites,
          maxEntradas: 0,
          storage: f.storage,
          aplicar: async () => {
            chamadas++;
          },
        }),
      ).rejects.toMatchObject({ codigo: "LIMITE" });
      expect(chamadas).toBe(0);
    }));
  it("erro do consumidor conserva causa e não gera recibo de conclusão", async () =>
    cenario(async (f) => {
      const { head } = await f.admitir();
      await f.storage.congelarCabecalho(head, "2026-11-19T10:02:00.000Z");
      const causa = new Error("fixture-consumer-failed");
      await expect(
        reaplicarLivroCongelado({
          ...limites,
          storage: f.storage,
          aplicar: async () => {
            throw causa;
          },
        }),
      ).rejects.toBe(causa);
    }));
  it("recusa mover ponteiro a partir de capacidade somente histórica", async () =>
    cenario(async (f) => {
      const { head } = await f.admitir(),
        historico = await f.storage.lerHistorico(1, head.sha256);
      expect(() => f.storage.congelarCabecalho(historico, "2026-11-19T10:02:00.000Z")).toThrow(
        /CONFIGURACAO/,
      );
      expect(() => f.storage.lerHistorico(0, "../cabecalho.json")).toThrow(/CONFIGURACAO/);
    }));
  it("recusa a perda do arquivo imutável do próprio cabeçalho corrente", async () =>
    cenario(async (f) => {
      const { head } = await f.admitir();
      await f.storage.congelarCabecalho(head, "2026-11-19T10:02:00.000Z");
      for (const key of f.http.objetos.keys())
        if (key.includes("/historico/0000000000000002-")) f.http.objetos.delete(key);
      let chamadas = 0;
      await expect(
        reaplicarLivroCongelado({
          ...limites,
          storage: f.storage,
          aplicar: async () => {
            chamadas++;
          },
        }),
      ).rejects.toMatchObject({ codigo: "AUSENTE" });
      expect(chamadas).toBe(0);
    }));
  it("retoma com chave inédita e verifica ambas as épocas sem reativar o writer antigo", async () =>
    cenario(async (f) => {
      const { head, doc } = await f.admitir(),
        congelado = await f.storage.congelarCabecalho(head, "2026-11-19T10:02:00.000Z");
      expect(() =>
        f.storage.retomarComNovaChave(congelado, "c".repeat(64), "2026-11-19T10:03:00.000Z"),
      ).toThrow(/CONFIGURACAO/);
      const key = randomBytes(32),
        nova = criarAssinaturaDoLivro({
          livroId: f.livroId,
          chaveAtiva: "v2",
          chaves: new Map([...f.chaves, ["v2", key]]),
        }),
        storage = criarArmazenamentoDoLivro({
          cliente: f.http.cliente,
          bucket: "recreio-fixture",
          assinatura: nova,
          tempoLimiteMs: 2000,
        });
      try {
        const fence = await storage.lerCabecalho(),
          aberto = await storage.retomarComNovaChave(
            fence,
            "c".repeat(64),
            "2026-11-19T10:03:00.000Z",
          );
        expect(aberto.documento).toMatchObject({
          estado: "aberto",
          epoca: 1,
          geracao: 3,
          entradas: 1,
          chavesUtilizadas: ["v1", "v2"],
          retomada: { cercaSha256: fence.sha256, reciboSha256: "c".repeat(64) },
        });
        await expect(f.storage.lerCabecalho()).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
        const intencao = { ...f.intencao(), epoca: 1 },
          bytes = nova.assinarIntencao(intencao),
          sha256 = resumoDoRegistro(bytes);
        await storage.publicarIntencao(bytes);
        const segundo = await storage.trocarCabecalho(
          aberto,
          nova.assinarCabecalho({
            ...aberto.documento,
            geracao: 4,
            entradas: 2,
            anteriorSha256: aberto.sha256,
            raizSha256: resumoDoRegistro(
              Buffer.from(JSON.stringify([aberto.documento.raizSha256, sha256])),
            ),
            ultimaIntencao: { operacaoId: intencao.operacaoId, revisao: 1, sha256 },
            atualizadoEm: "2026-11-19T10:04:00.000Z",
          }),
        );
        await storage.congelarCabecalho(segundo, "2026-11-19T10:05:00.000Z");
        const ids: string[] = [];
        const recibo = await reaplicarLivroCongelado({
          ...limites,
          storage,
          aplicar: async (i) => {
            ids.push(i.operacaoId);
          },
        });
        expect(ids).toEqual([doc.operacaoId, intencao.operacaoId]);
        expect(recibo.entradasReaplicadas).toBe(2);
      } finally {
        nova.encerrar();
        key.fill(0);
      }
    }));
});

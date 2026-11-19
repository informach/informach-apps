import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type FileHandle, mkdtemp, open, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { criarCifradorDeArquivos } from "../../../scripts/backup/arquivo-cifrado";
import {
  criarArquivoComposto,
  type ReferenciaDoArquivoComposto,
} from "../../../scripts/backup/arquivo-composto";
import { conferirObjetoDaCaptura, resumoDaReferencia } from "../backup/contrato";
import { criarCifradorDeObjetos } from "./criptografia";

const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const banco = Buffer.from(
  JSON.stringify({
    versao: 180006,
    banco: {
      encoding: "UTF8",
      datcollate: "C",
      datctype: "C",
      datlocprovider: "c",
      datlocale: null,
      datcollversion: null,
    },
    tabelas: [],
    estrutura: { linhas: 0, sha256: sha("") },
    permissoes: { linhas: 0, sha256: sha("") },
  }),
);
const config = { limiteBytes: 4 * 1024 * 1024, limiteFotografiaBytes: 4096, tempoLimiteMs: 5000 };
async function cenario(
  executar: (f: Awaited<ReturnType<typeof preparar>>) => Promise<void>,
  n = 2,
) {
  const f = await preparar(n);
  let resultado: { ok: true } | { ok: false; erro: unknown };
  try {
    await executar(f);
    resultado = { ok: true };
  } catch (erro) {
    resultado = { ok: false, erro };
  }
  const fechados = await Promise.allSettled(f.handles.map((h) => h.close()));
  const alvo = await realpath(f.root),
    pai = await realpath(tmpdir());
  if (dirname(alvo) !== pai || !basename(alvo).startsWith("recreio-composto-"))
    throw new Error("LIMPEZA_FORA_DO_ESCOPO");
  await rm(alvo, { recursive: true, force: true });
  const falhas = fechados.filter((r) => r.status === "rejected");
  if (!resultado.ok) {
    if (falhas.length)
      throw new AggregateError([resultado.erro, ...falhas.map((r) => r.reason)], "TESTE_E_LIMPEZA");
    throw resultado.erro;
  }
  expect(falhas).toEqual([]);
}
async function preparar(n = 2) {
  const root = await mkdtemp(join(tmpdir(), "recreio-composto-")),
    handles: FileHandle[] = [];
  const arquivo = async (nome: string, bytes?: Buffer) => {
    const h = await open(join(root, nome), "wx+", 0o600);
    handles.push(h);
    if (bytes) {
      await h.writeFile(bytes);
      await h.sync();
    }
    return h;
  };
  const dumpBytes = Buffer.concat([Buffer.from("PGDMP"), randomBytes(256 * 1024)]),
    dump = await arquivo("dump.bin", dumpBytes),
    inventarioBanco = await arquivo("banco.json", banco),
    saida = await arquivo("saida.bin");
  const keys = new Map([
      ["v1", randomBytes(32)],
      ["v2", randomBytes(32)],
    ]),
    idFotos = Array.from({ length: n }, () => randomUUID()).sort();
  const itens = [];
  for (const [i, id] of idFotos.entries()) {
    const mundo = randomUUID(),
      key = i % 2 === 0 ? "v1" : "v2",
      codec = criarCifradorDeObjetos({ chaveAtiva: key, chaves: keys, limiteBytes: 4096 });
    const envelope = codec.cifrar(
        { tipo: "fotografia", id: mundo },
        Buffer.from(`FOTOGRAFIA_SINTETICA_${i}`),
      ),
      r = envelope.referencia;
    const objeto = conferirObjetoDaCaptura({
      entregaId: randomUUID(),
      fotografiaId: id,
      mundoId: mundo,
      bucketId: randomUUID(),
      bucketName: "recreio-fixture",
      escopo: "qualification",
      objectKey: `recreio/v1/fotografia/${mundo}/${r.sha256Cifrado}`,
      referencia: r,
    });
    itens.push({
      objeto,
      arquivo: await arquivo(`objeto-${i}.bin`, envelope.bytes),
      envelope: envelope.bytes,
    });
  }
  const usadas = new Set(itens.map((i) => i.objeto.referencia.chaveId));
  const chaves = new Map([...keys].filter(([id]) => usadas.has(id))),
    hash = createHash("sha256");
  for (const i of itens) hash.update(resumoDaReferencia(i.objeto), "ascii");
  const inventario = {
    quantidade: itens.length,
    bytesCifrados: itens.reduce((n, i) => n + i.envelope.length, 0),
    sha256: hash.digest("hex"),
  };
  const pedido = {
    capturaId: randomUUID(),
    inventario,
    dump,
    inventarioBanco,
    chaves,
    objetos: (async function* () {
      yield* itens;
    })(),
  };
  const refAtual = async (ref: ReferenciaDoArquivoComposto) => {
    const b = await readFile(join(root, "saida.bin"));
    return { ...ref, bytes: b.length, sha256: sha(b) };
  };
  return {
    root,
    handles,
    arquivo,
    dumpBytes,
    dump,
    inventarioBanco,
    saida,
    pedido,
    itens,
    keys,
    refAtual,
    codec: criarArquivoComposto(config),
  };
}

describe("arquivo composto: arquivos reais, manifesto/chaves/envelopes fechados", () => {
  it("inventário com chave duplicada é recusado antes de gravar o composto", async () =>
    cenario(async (f) => {
      const duplicado = Buffer.from(
        banco.toString("utf8").replace('"versao":180006', '"versao":180006,"versao":180006'),
      );
      await f.inventarioBanco.truncate(0);
      await f.inventarioBanco.write(duplicado, 0, duplicado.length, 0);
      await f.inventarioBanco.sync();
      await expect(f.codec.montar(f.pedido, f.saida)).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
      expect((await f.saida.stat()).size).toBe(0);
    }));
  it("cabeçalho com chave duplicada falha mesmo com tamanho/SHA atualizados", async () =>
    cenario(async (f) => {
      const ref = await f.codec.montar(f.pedido, f.saida),
        original = await readFile(join(f.root, "saida.bin")),
        n = original.readUInt32BE(8);
      const primeiro = Buffer.from(
          original
            .subarray(12, 12 + n)
            .toString("utf8")
            .replace('"tipo":"inicio"', '"tipo":"inicio","tipo":"inicio"'),
        ),
        tamanho = Buffer.alloc(4);
      tamanho.writeUInt32BE(primeiro.length);
      const bytes = Buffer.concat([
        original.subarray(0, 8),
        tamanho,
        primeiro,
        original.subarray(12 + n),
      ]);
      await f.saida.truncate(0);
      await f.saida.write(bytes, 0, bytes.length, 0);
      await f.saida.sync();
      await expect(f.codec.conferir(f.saida, await f.refAtual(ref))).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
    }));
  it("conserva dump, inventário, duas versões de chave e referências completas", async () =>
    cenario(async (f) => {
      const chavesAntes = new Map([...f.keys].map(([k, v]) => [k, Buffer.from(v)]));
      const ref = await f.codec.montar(f.pedido, f.saida),
        validado = await f.codec.conferir(f.saida, ref);
      expect(validado).toMatchObject({
        capturaId: f.pedido.capturaId,
        inventario: f.pedido.inventario,
        dump: { bytes: f.dumpBytes.length, sha256: sha(f.dumpBytes) },
        banco: { bytes: banco.length, sha256: sha(banco) },
      });
      expect(await readFile(join(f.root, "dump.bin"))).toEqual(f.dumpBytes);
      expect(await readFile(join(f.root, "banco.json"))).toEqual(banco);
      expect(f.keys).toEqual(chavesAntes);
      expect((await f.saida.stat()).size).toBe(ref.bytes);
    }));
  it("aceita zero fotografias e zero chaves sem fabricar conteúdo", async () =>
    cenario(async (f) => {
      const ref = await f.codec.montar(f.pedido, f.saida);
      expect((await f.codec.conferir(f.saida, ref)).inventario.quantidade).toBe(0);
    }, 0));
  it("arquivo externo cifra o composto e a abertura conserva seu SHA/manifesto", async () =>
    cenario(async (f) => {
      const ref = await f.codec.montar(f.pedido, f.saida),
        cifrado = await f.arquivo("cifrado.bin"),
        aberto = await f.arquivo("aberto.bin");
      const externo = criarCifradorDeArquivos({
        chaveAtiva: "backup",
        chaves: new Map([["backup", randomBytes(32)]]),
        limiteBytes: config.limiteBytes,
        tempoLimiteMs: 5000,
      });
      const guardado = await externo.cifrar(f.saida, cifrado, {
        tipo: "backup",
        id: ref.capturaId,
      });
      expect(guardado.sha256).toBe(ref.sha256);
      const bytes = await readFile(join(f.root, "cifrado.bin"));
      for (const k of f.keys.values()) expect(bytes.includes(k)).toBe(false);
      await externo.abrir(cifrado, aberto, guardado);
      expect((await f.codec.conferir(aberto, ref)).inventario).toEqual(f.pedido.inventario);
    }));
  it("não sobrescreve destino preexistente nem aceita alias do dump", async () =>
    cenario(async (f) => {
      await f.saida.writeFile(Buffer.from("PRESERVAR"));
      await expect(f.codec.montar(f.pedido, f.saida)).rejects.toThrow();
      await expect(f.codec.montar(f.pedido, f.dump)).rejects.toThrow();
      expect(await readFile(join(f.root, "saida.bin"))).toEqual(Buffer.from("PRESERVAR"));
      expect(await readFile(join(f.root, "dump.bin"))).toEqual(f.dumpBytes);
    }));
  it.each(["ausente", "errada", "extra"] as const)(
    "chave %s recusa o composto e limpa a saída",
    async (caso) =>
      cenario(async (f) => {
        const chaves = new Map(f.pedido.chaves);
        if (caso === "ausente") chaves.delete("v2");
        else if (caso === "errada") chaves.set("v2", randomBytes(32));
        else chaves.set("nao-usada", randomBytes(32));
        await expect(f.codec.montar({ ...f.pedido, chaves }, f.saida)).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
        expect((await f.saida.stat()).size).toBe(0);
      }),
  );
  it.each(["duplicada", "invertida", "incompleta"] as const)(
    "ordem/lista %s não publica manifesto parcial",
    async (caso) =>
      cenario(async (f) => {
        const primeiro = f.itens[0];
        if (!primeiro) throw new Error("Objeto ausente");
        const lista =
          caso === "duplicada"
            ? [primeiro, primeiro]
            : caso === "invertida"
              ? [...f.itens].reverse()
              : [primeiro];
        await expect(
          f.codec.montar(
            {
              ...f.pedido,
              objetos: (async function* () {
                yield* lista;
              })(),
            },
            f.saida,
          ),
        ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
        expect((await f.saida.stat()).size).toBe(0);
      }),
  );
  it("teto total e cancelamento durante a montagem limpam estágio admitido", async () =>
    cenario(async (f) => {
      const curto = criarArquivoComposto({
        ...config,
        limiteBytes: f.dumpBytes.length + banco.length,
      });
      await expect(curto.montar(f.pedido, f.saida)).rejects.toMatchObject({ codigo: "LIMITE" });
      expect((await f.saida.stat()).size).toBe(0);
      const ctrl = new AbortController();
      await expect(
        f.codec.montar(
          {
            ...f.pedido,
            objetos: (async function* () {
              ctrl.abort();
              yield* f.itens;
            })(),
          },
          f.saida,
          ctrl.signal,
        ),
      ).rejects.toMatchObject({ codigo: "INTERROMPIDO" });
      expect((await f.saida.stat()).size).toBe(0);
      expect(await readFile(join(f.root, "dump.bin"))).toEqual(f.dumpBytes);
    }));
  it("mudança no dump depois da cópia impede concluir o arquivo", async () =>
    cenario(async (f) => {
      await expect(
        f.codec.montar(
          {
            ...f.pedido,
            objetos: (async function* () {
              await f.dump.write(Buffer.from([0]), 0, 1, 0);
              await f.dump.sync();
              yield* f.itens;
            })(),
          },
          f.saida,
        ),
      ).rejects.toMatchObject({ codigo: "FONTE_ALTERADA" });
      expect((await f.saida.stat()).size).toBe(0);
      expect((await readFile(join(f.root, "dump.bin")))[0]).toBe(0);
    }));
  it.each(["magia", "dump", "objeto", "metadados"] as const)(
    "adulteração em %s falha mesmo recalculando SHA externo",
    async (caso) =>
      cenario(async (f) => {
        const ref = await f.codec.montar(f.pedido, f.saida),
          bytes = await readFile(join(f.root, "saida.bin"));
        let pos = 0;
        if (caso === "dump") pos = bytes.indexOf(Buffer.from("PGDMP")) + 5;
        else if (caso === "objeto") {
          const item = f.itens[0];
          if (!item) throw new Error("Objeto ausente");
          pos = bytes.indexOf(item.envelope) + item.envelope.length - 1;
        } else if (caso === "metadados") pos = bytes.indexOf(Buffer.from("recreio-fixture"));
        expect(pos).toBeGreaterThanOrEqual(0);
        bytes[pos] = (bytes[pos] ?? 0) ^ 1;
        await f.saida.truncate(0);
        await f.saida.write(bytes, 0, bytes.length, 0);
        await f.saida.sync();
        await expect(f.codec.conferir(f.saida, await f.refAtual(ref))).rejects.toMatchObject({
          codigo: "INTEGRIDADE",
        });
      }),
  );
  it.each([1, 17, 0])("arquivo truncado/excedente (%i) não é aceito com novo SHA", async (corte) =>
    cenario(async (f) => {
      const ref = await f.codec.montar(f.pedido, f.saida),
        origem = await readFile(join(f.root, "saida.bin")),
        bytes = corte
          ? origem.subarray(0, origem.length - corte)
          : Buffer.concat([origem, Buffer.from("X")]);
      await f.saida.truncate(0);
      await f.saida.write(bytes, 0, bytes.length, 0);
      await f.saida.sync();
      await expect(f.codec.conferir(f.saida, await f.refAtual(ref))).rejects.toThrow();
    }),
  );
  it("contexto e campos livres na referência são recusados", async () =>
    cenario(async (f) => {
      const ref = await f.codec.montar(f.pedido, f.saida);
      await expect(
        f.codec.conferir(f.saida, { ...ref, capturaId: randomUUID() }),
      ).rejects.toMatchObject({ codigo: "INTEGRIDADE" });
      await expect(f.codec.conferir(f.saida, { ...ref, path: "../fora" })).rejects.toMatchObject({
        codigo: "INTEGRIDADE",
      });
    }));
});

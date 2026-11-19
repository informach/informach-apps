import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { z } from "zod";
import {
  conferirObjetoDaCaptura,
  FalhaDaCaptura,
  type ObjetoDaCaptura,
  resumoDaReferencia,
} from "../../src/features/backup/contrato";
import {
  criarCifradorDeObjetos,
  FalhaDoObjetoPrivado,
} from "../../src/features/objetos/criptografia";
import { GlobaisPostgresSchema } from "./globais-postgres";

const MAGIA = Buffer.from("RCROBK01", "ascii"),
  BLOCO = 64 * 1024,
  MAX = 64 * 1024 * 1024 * 1024,
  MAX_JSON = 512 * 1024;
const Sha = z.string().regex(/^[a-f0-9]{64}$/),
  ChaveId = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const Bytes = z.number().int().min(0).max(MAX);
const Inventario = z.strictObject({
  quantidade: z.number().int().min(0).max(1_000_000),
  bytesCifrados: Bytes,
  sha256: Sha,
});
const Referencia = z.strictObject({
  formato: z.literal("recreio-captura-composta-v1"),
  capturaId: z.uuid(),
  bytes: Bytes,
  sha256: Sha,
});
const Resumo = z.strictObject({
  linhas: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  sha256: Sha,
});
const Texto = z.string().max(256);
const Banco = z.strictObject({
  metodo: z.literal("recreio-inventario-v2"),
  versao: z.number().int().min(180000).max(189999),
  globais: GlobaisPostgresSchema,
  banco: z.strictObject({
    encoding: Texto,
    datcollate: Texto,
    datctype: Texto,
    datlocprovider: Texto,
    datlocale: Texto.nullable(),
    datcollversion: Texto.nullable(),
  }),
  tabelas: z
    .array(
      z.strictObject({
        schema: z.string().min(1).max(63),
        nome: z.string().min(1).max(63),
        resumo: Resumo,
      }),
    )
    .max(10000),
  estrutura: Resumo,
  permissoes: Resumo,
});
const Cabecalho = z.discriminatedUnion("tipo", [
  z.strictObject({ tipo: z.literal("inicio"), capturaId: z.uuid(), inventario: Inventario }),
  z.strictObject({ tipo: z.literal("chaves"), ids: z.array(ChaveId).max(16) }),
  z.strictObject({ tipo: z.literal("dump"), bytes: Bytes, sha256: Sha }),
  z.strictObject({
    tipo: z.literal("banco"),
    bytes: z.number().int().min(2).max(MAX_JSON),
    sha256: Sha,
  }),
  z.strictObject({ tipo: z.literal("objeto"), objeto: z.unknown() }),
  z.strictObject({ tipo: z.literal("fim"), capturaId: z.uuid(), inventario: Inventario }),
]);
export type ReferenciaDoArquivoComposto = z.infer<typeof Referencia>;
/** Marca apenas a fronteira do callback interno. Seu erro pertence ao
 * chamador, não ao transporte/decoder, e precisa conservar identidade/causa. */
class FalhaDoConsumidor extends Error {
  constructor(readonly original: unknown) {
    super("recreio.backup_composite.consumer_failed");
  }
}

export class FalhaDoArquivoComposto extends Error {
  constructor(
    readonly codigo:
      | "CONFIGURACAO"
      | "LIMITE"
      | "INTEGRIDADE"
      | "FONTE_ALTERADA"
      | "INTERROMPIDO"
      | "IO"
      | "LIMPEZA",
  ) {
    super(`recreio.composite_file.${codigo}`);
  }
}
function exigir(sim: unknown, codigo: FalhaDoArquivoComposto["codigo"]): asserts sim {
  if (!sim) throw new FalhaDoArquivoComposto(codigo);
}
export function conferirReferenciaDoArquivoComposto(bruto: unknown): ReferenciaDoArquivoComposto {
  const r = Referencia.safeParse(bruto);
  exigir(r.success, "INTEGRIDADE");
  return r.data;
}
const mesmoInventario = (a: z.infer<typeof Inventario>, b: z.infer<typeof Inventario>) =>
  a.quantidade === b.quantidade && a.bytesCifrados === b.bytesCifrados && a.sha256 === b.sha256;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const mesma = (a: BigIntStats, b: BigIntStats) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeNs === b.mtimeNs &&
  a.ctimeNs === b.ctimeNs &&
  a.nlink === b.nlink;
async function info(h: FileHandle, teto: number) {
  const s = await h.stat({ bigint: true });
  exigir(s.isFile() && s.nlink === 1n, "CONFIGURACAO");
  exigir(s.size <= BigInt(teto), "LIMITE");
  return s;
}
async function ler(
  h: FileHandle,
  pos: number,
  bytes: number,
  signal: AbortSignal,
  consumir: (b: Buffer) => Promise<void> | void,
) {
  const bloco = Buffer.alloc(Math.min(BLOCO, bytes));
  let n = 0;
  try {
    while (n < bytes) {
      exigir(!signal.aborted, "INTERROMPIDO");
      const r = await h.read(bloco, 0, Math.min(bloco.length, bytes - n), pos + n);
      exigir(!signal.aborted, "INTERROMPIDO");
      exigir(r.bytesRead > 0, "FONTE_ALTERADA");
      n += r.bytesRead;
      await consumir(bloco.subarray(0, r.bytesRead));
    }
  } finally {
    bloco.fill(0);
  }
}
async function pequeno(h: FileHandle, pos: number, bytes: number, signal: AbortSignal) {
  const b = Buffer.alloc(bytes);
  let n = 0;
  try {
    await ler(h, pos, bytes, signal, (p) => {
      b.set(p, n);
      n += p.length;
    });
    return b;
  } catch (e) {
    b.fill(0);
    throw e;
  }
}
async function resumo(h: FileHandle, teto: number, signal: AbortSignal) {
  const antes = await info(h, teto),
    hash = createHash("sha256");
  await ler(h, 0, Number(antes.size), signal, (b) => {
    hash.update(b);
  });
  exigir(mesma(antes, await info(h, teto)), "FONTE_ALTERADA");
  return { antes, bytes: Number(antes.size), sha256: hash.digest("hex") };
}
function json(bruto: Buffer): unknown {
  try {
    return JSON.parse(bruto.toString("utf8"));
  } catch {
    throw new FalhaDoArquivoComposto("INTEGRIDADE");
  }
}
function bancoValido(bruto: Buffer): boolean {
  const v = Banco.safeParse(json(bruto));
  return v.success && Buffer.from(JSON.stringify(v.data), "utf8").equals(bruto);
}
function interpretarCabecalho(b: Buffer) {
  const v = Cabecalho.safeParse(json(b));
  exigir(v.success, "INTEGRIDADE");
  exigir(Buffer.from(JSON.stringify(v.data), "utf8").equals(b), "INTEGRIDADE");
  return v.data;
}
type Trecho = { inicio: number; bytes: number; sha256: string };
async function limpar(h: FileHandle) {
  try {
    await h.truncate(0);
    await h.sync();
  } catch {
    throw new FalhaDoArquivoComposto("LIMPEZA");
  }
}

/** Contêiner técnico sem caminhos ou extração genérica. O composto em claro
 * pertence a um executor privado e precisa do envelope externo antes de sair
 * dele. Dump/objetos/segredos não são retornados na referência ou no resumo. */
export function criarArquivoComposto(config: {
  limiteBytes: number;
  limiteFotografiaBytes: number;
  tempoLimiteMs: number;
}) {
  const { limiteBytes, limiteFotografiaBytes, tempoLimiteMs } = config;
  exigir(
    Number.isSafeInteger(limiteBytes) &&
      limiteBytes > 0 &&
      limiteBytes <= MAX &&
      Number.isSafeInteger(limiteFotografiaBytes) &&
      limiteFotografiaBytes > 0 &&
      limiteFotografiaBytes <= 256 * 1024 * 1024 &&
      Number.isSafeInteger(tempoLimiteMs) &&
      tempoLimiteMs > 0 &&
      tempoLimiteMs <= 900_000,
    "CONFIGURACAO",
  );
  async function comPrazo<T>(
    fn: (s: AbortSignal) => Promise<T>,
    ...externos: (AbortSignal | undefined)[]
  ) {
    const c = new AbortController(),
      cancelar = () => c.abort();
    for (const externo of externos) {
      externo?.addEventListener("abort", cancelar, { once: true });
      if (externo?.aborted) cancelar();
    }
    const timer = setTimeout(cancelar, tempoLimiteMs);
    timer.unref();
    try {
      exigir(!c.signal.aborted, "INTERROMPIDO");
      return await fn(c.signal);
    } catch (e) {
      if (e instanceof FalhaDoConsumidor) throw e.original;
      if (e instanceof FalhaDoArquivoComposto) throw e;
      if (e instanceof FalhaDaCaptura || e instanceof FalhaDoObjetoPrivado)
        throw new FalhaDoArquivoComposto("INTEGRIDADE");
      throw new FalhaDoArquivoComposto("IO");
    } finally {
      clearTimeout(timer);
      for (const externo of externos) externo?.removeEventListener("abort", cancelar);
      c.abort();
    }
  }
  async function montar(
    pedido: {
      capturaId: string;
      inventario: z.infer<typeof Inventario>;
      dump: FileHandle;
      inventarioBanco: FileHandle;
      chaves: ReadonlyMap<string, Uint8Array>;
      objetos: AsyncIterable<{ objeto: ObjetoDaCaptura; arquivo: FileHandle }>;
    },
    destino: FileHandle,
    externo?: AbortSignal,
  ): Promise<ReferenciaDoArquivoComposto> {
    return comPrazo(async (signal) => {
      const capturaId = pedido.capturaId,
        lido = Inventario.safeParse(pedido.inventario);
      exigir(lido.success, "CONFIGURACAO");
      const esperado = lido.data;
      exigir(
        z.uuid().safeParse(capturaId).success && lido.success && pedido.chaves.size <= 16,
        "CONFIGURACAO",
      );
      const saida = await info(destino, 0);
      exigir(saida.size === 0n, "CONFIGURACAO");
      const ids = [...pedido.chaves.keys()].sort(),
        material = Buffer.alloc(ids.length * 32);
      let admitida = false;
      try {
        for (const [i, id] of ids.entries()) {
          const k = pedido.chaves.get(id);
          exigir(
            ChaveId.safeParse(id).success && k instanceof Uint8Array && k.length === 32,
            "CONFIGURACAO",
          );
          material.set(k, i * 32);
        }
        const codec = ids[0]
          ? criarCifradorDeObjetos({
              chaveAtiva: ids[0],
              chaves: pedido.chaves,
              limiteBytes: limiteFotografiaBytes,
            })
          : null;
        const dump = await resumo(pedido.dump, limiteBytes, signal),
          banco = await resumo(pedido.inventarioBanco, MAX_JSON, signal);
        exigir(dump.antes.dev !== saida.dev || dump.antes.ino !== saida.ino, "CONFIGURACAO");
        exigir(banco.antes.dev !== saida.dev || banco.antes.ino !== saida.ino, "CONFIGURACAO");
        const prefixo = await pequeno(pedido.dump, 0, Math.min(5, dump.bytes), signal);
        exigir(prefixo.toString("ascii") === "PGDMP", "INTEGRIDADE");
        const bancoJson = await pequeno(pedido.inventarioBanco, 0, banco.bytes, signal);
        try {
          exigir(bancoValido(bancoJson), "INTEGRIDADE");
        } finally {
          bancoJson.fill(0);
        }
        admitida = true;
        let pos = 0;
        const total = createHash("sha256");
        const escrever = async (bytes: Buffer) => {
          exigir(!signal.aborted, "INTERROMPIDO");
          exigir(pos + bytes.length <= limiteBytes, "LIMITE");
          let n = 0;
          while (n < bytes.length) {
            const r = await destino.write(bytes, n, bytes.length - n, pos + n);
            exigir(r.bytesWritten > 0, "IO");
            n += r.bytesWritten;
          }
          total.update(bytes);
          pos += bytes.length;
        };
        const cabecalho = async (v: z.infer<typeof Cabecalho>) => {
          const b = Buffer.from(JSON.stringify(Cabecalho.parse(v))),
            n = Buffer.alloc(4);
          exigir(b.length <= 4096, "LIMITE");
          n.writeUInt32BE(b.length);
          await escrever(n);
          await escrever(b);
        };
        const copiar = async (h: FileHandle, r: Awaited<ReturnType<typeof resumo>>) => {
          const hash = createHash("sha256");
          await ler(h, 0, r.bytes, signal, async (b) => {
            hash.update(b);
            await escrever(b);
          });
          exigir(
            hash.digest("hex") === r.sha256 && mesma(r.antes, await info(h, limiteBytes)),
            "FONTE_ALTERADA",
          );
        };
        await escrever(MAGIA);
        await cabecalho({
          tipo: "inicio",
          capturaId,
          inventario: esperado,
        });
        await cabecalho({ tipo: "chaves", ids });
        await escrever(material);
        material.fill(0);
        await cabecalho({ tipo: "dump", bytes: dump.bytes, sha256: dump.sha256 });
        await copiar(pedido.dump, dump);
        await cabecalho({ tipo: "banco", bytes: banco.bytes, sha256: banco.sha256 });
        await copiar(pedido.inventarioBanco, banco);
        const hash = createHash("sha256"),
          usadas = new Set<string>();
        let quantidade = 0,
          bytesCifrados = 0,
          anterior = "";
        for await (const item of pedido.objetos) {
          exigir(!signal.aborted, "INTERROMPIDO");
          const objeto = conferirObjetoDaCaptura(item.objeto),
            r = objeto.referencia;
          exigir(objeto.fotografiaId > anterior && quantidade < esperado.quantidade, "INTEGRIDADE");
          anterior = objeto.fotografiaId;
          exigir(codec && ids.includes(r.chaveId), "INTEGRIDADE");
          exigir(r.bytes <= limiteFotografiaBytes, "LIMITE");
          const antes = await info(item.arquivo, limiteFotografiaBytes + 1024);
          exigir(Number(antes.size) === r.bytesCifrados, "INTEGRIDADE");
          exigir(
            Number(antes.size) === r.bytesCifrados &&
              (antes.dev !== saida.dev || antes.ino !== saida.ino),
            "CONFIGURACAO",
          );
          const envelope = await pequeno(item.arquivo, 0, r.bytesCifrados, signal);
          try {
            codec.abrir(r, envelope).fill(0);
            await cabecalho({ tipo: "objeto", objeto });
            await escrever(envelope);
            exigir(mesma(antes, await info(item.arquivo, r.bytesCifrados)), "FONTE_ALTERADA");
          } finally {
            envelope.fill(0);
          }
          hash.update(resumoDaReferencia(objeto), "ascii");
          quantidade++;
          bytesCifrados += r.bytesCifrados;
          usadas.add(r.chaveId);
        }
        const inventario = { quantidade, bytesCifrados, sha256: hash.digest("hex") };
        exigir(mesmoInventario(inventario, esperado) && usadas.size === ids.length, "INTEGRIDADE");
        await cabecalho({ tipo: "fim", capturaId, inventario });
        await destino.sync();
        exigir(
          mesma(dump.antes, await info(pedido.dump, limiteBytes)) &&
            mesma(banco.antes, await info(pedido.inventarioBanco, MAX_JSON)),
          "FONTE_ALTERADA",
        );
        exigir(!signal.aborted, "INTERROMPIDO");
        return Referencia.parse({
          formato: "recreio-captura-composta-v1",
          capturaId,
          bytes: pos,
          sha256: total.digest("hex"),
        });
      } catch (e) {
        if (admitida) await limpar(destino);
        throw e;
      } finally {
        material.fill(0);
      }
    }, externo);
  }

  async function analisar(origem: FileHandle, bruto: unknown, externo?: AbortSignal) {
    return comPrazo(async (signal) => {
      const lida = Referencia.safeParse(bruto);
      exigir(lida.success, "INTEGRIDADE");
      const ref = lida.data;
      const antes = await info(origem, limiteBytes);
      exigir(Number(antes.size) === ref.bytes, "INTEGRIDADE");
      let pos = 0;
      const total = createHash("sha256"),
        chaves = new Map<string, Buffer>();
      const consumir = async (bytes: number, fn: (b: Buffer) => Promise<void> | void) => {
        exigir(
          Number.isSafeInteger(bytes) && bytes >= 0 && pos + bytes <= ref.bytes,
          "INTEGRIDADE",
        );
        await ler(origem, pos, bytes, signal, async (b) => {
          total.update(b);
          await fn(b);
        });
        pos += bytes;
      };
      const pequenoEm = async (bytes: number, teto: number) => {
        exigir(bytes <= teto, "LIMITE");
        const b = Buffer.alloc(bytes);
        let n = 0;
        try {
          await consumir(bytes, (p) => {
            b.set(p, n);
            n += p.length;
          });
          return b;
        } catch (e) {
          b.fill(0);
          throw e;
        }
      };
      const cabecalho = async () => {
        const n = await pequenoEm(4, 4),
          bytes = n.readUInt32BE();
        exigir(bytes >= 2 && bytes <= 4096, "INTEGRIDADE");
        const b = await pequenoEm(bytes, 4096);
        try {
          return interpretarCabecalho(b);
        } finally {
          b.fill(0);
        }
      };
      try {
        const magia = await pequenoEm(8, 8);
        exigir(magia.equals(MAGIA), "INTEGRIDADE");
        const inicio = await cabecalho();
        exigir(inicio.tipo === "inicio" && inicio.capturaId === ref.capturaId, "INTEGRIDADE");
        const keys = await cabecalho();
        exigir(
          keys.tipo === "chaves" &&
            keys.ids.every((id, i) => i === 0 || id > (keys.ids[i - 1] ?? "")),
          "INTEGRIDADE",
        );
        const inicioChaves = pos;
        const material = await pequenoEm(keys.ids.length * 32, 512),
          shaChaves = sha(material);
        try {
          for (const [i, id] of keys.ids.entries())
            chaves.set(id, Buffer.from(material.subarray(i * 32, i * 32 + 32)));
        } finally {
          material.fill(0);
        }
        const codec = keys.ids[0]
          ? criarCifradorDeObjetos({
              chaveAtiva: keys.ids[0],
              chaves,
              limiteBytes: limiteFotografiaBytes,
            })
          : null;
        const dump = await cabecalho();
        exigir(dump.tipo === "dump" && dump.bytes >= 5, "INTEGRIDADE");
        const inicioDump = pos;
        const hashDump = createHash("sha256");
        let prefixo = Buffer.alloc(0);
        await consumir(dump.bytes, (b) => {
          if (prefixo.length < 5)
            prefixo = Buffer.concat([prefixo, b.subarray(0, 5 - prefixo.length)]);
          hashDump.update(b);
        });
        exigir(
          prefixo.toString("ascii") === "PGDMP" && hashDump.digest("hex") === dump.sha256,
          "INTEGRIDADE",
        );
        const banco = await cabecalho();
        exigir(banco.tipo === "banco", "INTEGRIDADE");
        const inicioBanco = pos;
        const bancoJson = await pequenoEm(banco.bytes, MAX_JSON);
        try {
          exigir(sha(bancoJson) === banco.sha256 && bancoValido(bancoJson), "INTEGRIDADE");
        } finally {
          bancoJson.fill(0);
        }
        const inicioObjetos = pos;
        let quantidade = 0,
          bytesCifrados = 0,
          anterior = "";
        const hash = createHash("sha256"),
          usadas = new Set<string>();
        for (;;) {
          const frame = await cabecalho();
          if (frame.tipo === "fim") {
            const inventario = { quantidade, bytesCifrados, sha256: hash.digest("hex") };
            exigir(
              frame.capturaId === ref.capturaId &&
                mesmoInventario(inventario, frame.inventario) &&
                mesmoInventario(inventario, inicio.inventario) &&
                usadas.size === chaves.size,
              "INTEGRIDADE",
            );
            break;
          }
          exigir(
            frame.tipo === "objeto" && quantidade < inicio.inventario.quantidade,
            "INTEGRIDADE",
          );
          const objeto = conferirObjetoDaCaptura(frame.objeto),
            r = objeto.referencia;
          exigir(objeto.fotografiaId > anterior, "INTEGRIDADE");
          anterior = objeto.fotografiaId;
          exigir(codec && chaves.has(r.chaveId), "INTEGRIDADE");
          exigir(r.bytes <= limiteFotografiaBytes, "LIMITE");
          const envelope = await pequenoEm(r.bytesCifrados, limiteFotografiaBytes + 1024);
          try {
            codec.abrir(r, envelope).fill(0);
          } finally {
            envelope.fill(0);
          }
          hash.update(resumoDaReferencia(objeto), "ascii");
          quantidade++;
          bytesCifrados += r.bytesCifrados;
          usadas.add(r.chaveId);
        }
        exigir(
          pos === ref.bytes &&
            total.digest("hex") === ref.sha256 &&
            mesma(antes, await info(origem, limiteBytes)),
          "INTEGRIDADE",
        );
        exigir(!signal.aborted, "INTERROMPIDO");
        return {
          resumo: {
            capturaId: ref.capturaId,
            inventario: inicio.inventario,
            dump: { bytes: dump.bytes, sha256: dump.sha256 },
            banco: { bytes: banco.bytes, sha256: banco.sha256 },
          },
          fonte: antes,
          ref,
          trechos: {
            dump: { inicio: inicioDump, bytes: dump.bytes, sha256: dump.sha256 },
            banco: { inicio: inicioBanco, bytes: banco.bytes, sha256: banco.sha256 },
            chaves: { inicio: inicioChaves, bytes: keys.ids.length * 32, sha256: shaChaves },
            idsChaves: keys.ids,
            inicioObjetos,
          },
        };
      } finally {
        for (const k of chaves.values()) k.fill(0);
      }
    }, externo);
  }
  async function conferir(origem: FileHandle, bruto: unknown, externo?: AbortSignal) {
    return (await analisar(origem, bruto, externo)).resumo;
  }
  /** Só após validar TODO o arquivo. Capacidades de trechos não são caminhos,
   * autorização de download ou confirmação de restauração. Origem emprestada
   * deve permanecer aberta/imutável; encerramento revoga as capacidades. */
  async function abrir(origem: FileHandle, bruto: unknown, externo?: AbortSignal) {
    const v = await analisar(origem, bruto, externo),
      vida = new AbortController();
    const conferirFonte = async (signal: AbortSignal) => {
      exigir(!signal.aborted, "INTERROMPIDO");
      const atual = await info(origem, limiteBytes);
      exigir(!signal.aborted, "INTERROMPIDO");
      exigir(mesma(v.fonte, atual), "FONTE_ALTERADA");
    };
    async function copiar(trecho: Trecho, destino: FileHandle, signal: AbortSignal) {
      await conferirFonte(signal);
      const saida = await info(destino, 0);
      exigir(saida.dev !== v.fonte.dev || saida.ino !== v.fonte.ino, "CONFIGURACAO");
      let admitida = false;
      try {
        admitida = true;
        let n = 0;
        const hash = createHash("sha256");
        await ler(origem, trecho.inicio, trecho.bytes, signal, async (b) => {
          let gravados = 0;
          while (gravados < b.length) {
            exigir(!signal.aborted, "INTERROMPIDO");
            const r = await destino.write(b, gravados, b.length - gravados, n + gravados);
            exigir(r.bytesWritten > 0, "IO");
            gravados += r.bytesWritten;
          }
          n += b.length;
          hash.update(b);
        });
        exigir(n === trecho.bytes && hash.digest("hex") === trecho.sha256, "INTEGRIDADE");
        await destino.sync();
        await conferirFonte(signal);
      } catch (e) {
        if (admitida) await limpar(destino);
        throw e;
      }
    }
    async function lerTrecho(trecho: Trecho, signal: AbortSignal, teto: number) {
      await conferirFonte(signal);
      exigir(trecho.bytes <= teto, "LIMITE");
      const b = await pequeno(origem, trecho.inicio, trecho.bytes, signal);
      try {
        exigir(sha(b) === trecho.sha256, "INTEGRIDADE");
        await conferirFonte(signal);
        return b;
      } catch (e) {
        b.fill(0);
        throw e;
      }
    }
    async function header(pos: number, signal: AbortSignal) {
      await conferirFonte(signal);
      exigir(pos + 4 <= v.ref.bytes, "INTEGRIDADE");
      const n = await pequeno(origem, pos, 4, signal),
        bytes = n.readUInt32BE();
      exigir(bytes >= 2 && bytes <= 4096 && pos + 4 + bytes <= v.ref.bytes, "INTEGRIDADE");
      const b = await pequeno(origem, pos + 4, bytes, signal);
      try {
        return { valor: interpretarCabecalho(b), pos: pos + 4 + bytes };
      } finally {
        b.fill(0);
      }
    }
    return Object.freeze({
      resumo: Object.freeze({
        capturaId: v.resumo.capturaId,
        inventario: Object.freeze({ ...v.resumo.inventario }),
        dump: Object.freeze({ ...v.resumo.dump }),
        banco: Object.freeze({ ...v.resumo.banco }),
      }),
      encerrar: () => vida.abort(),
      copiarDump: (destino: FileHandle, sinal?: AbortSignal) =>
        comPrazo((signal) => copiar(v.trechos.dump, destino, signal), externo, vida.signal, sinal),
      lerInventarioBanco: (sinal?: AbortSignal) =>
        comPrazo(
          async (signal) => {
            const b = await lerTrecho(v.trechos.banco, signal, MAX_JSON);
            try {
              exigir(bancoValido(b), "INTEGRIDADE");
              return Banco.parse(json(b));
            } finally {
              b.fill(0);
            }
          },
          externo,
          vida.signal,
          sinal,
        ),
      comChaves: <T>(
        fn: (chaves: ReadonlyMap<string, Uint8Array>, signal: AbortSignal) => Promise<T>,
        sinal?: AbortSignal,
      ) =>
        comPrazo(
          async (signal) => {
            const material = await lerTrecho(v.trechos.chaves, signal, 512),
              chaves = new Map<string, Buffer>();
            try {
              for (const [i, id] of v.trechos.idsChaves.entries())
                chaves.set(id, Buffer.from(material.subarray(i * 32, i * 32 + 32)));
              let resultado: T;
              try {
                resultado = await fn(chaves, signal);
              } catch (erro) {
                // comPrazo classifica I/O próprio, sem reclassificar a decisão
                // transacional/de integridade tomada pelo consumidor.
                throw new FalhaDoConsumidor(erro);
              }
              exigir(!signal.aborted, "INTERROMPIDO");
              return resultado;
            } finally {
              material.fill(0);
              for (const k of chaves.values()) k.fill(0);
              chaves.clear();
            }
          },
          externo,
          vida.signal,
          sinal,
        ),
      objetos: async function* (sinal?: AbortSignal) {
        let pos = v.trechos.inicioObjetos,
          quantidade = 0,
          bytesCifrados = 0,
          anterior = "";
        const hash = createHash("sha256");
        while (quantidade < v.resumo.inventario.quantidade) {
          const passo = await comPrazo(
            async (signal) => {
              const h = await header(pos, signal);
              exigir(h.valor.tipo === "objeto", "INTEGRIDADE");
              const objeto = conferirObjetoDaCaptura(h.valor.objeto),
                r = objeto.referencia;
              exigir(
                objeto.fotografiaId > anterior && h.pos + r.bytesCifrados <= v.ref.bytes,
                "INTEGRIDADE",
              );
              return {
                objeto,
                trecho: { inicio: h.pos, bytes: r.bytesCifrados, sha256: r.sha256Cifrado },
              };
            },
            externo,
            vida.signal,
            sinal,
          );
          const trecho = passo.trecho;
          pos = trecho.inicio + trecho.bytes;
          anterior = passo.objeto.fotografiaId;
          hash.update(resumoDaReferencia(passo.objeto), "ascii");
          quantidade++;
          bytesCifrados += trecho.bytes;
          yield Object.freeze({
            objeto: passo.objeto,
            copiarPara: (destino: FileHandle) =>
              comPrazo((signal) => copiar(trecho, destino, signal), externo, vida.signal, sinal),
          });
        }
        await comPrazo(
          async (signal) => {
            const h = await header(pos, signal),
              inventario = { quantidade, bytesCifrados, sha256: hash.digest("hex") };
            exigir(
              h.valor.tipo === "fim" &&
                h.valor.capturaId === v.ref.capturaId &&
                h.pos === v.ref.bytes &&
                mesmoInventario(inventario, v.resumo.inventario) &&
                mesmoInventario(inventario, h.valor.inventario),
              "INTEGRIDADE",
            );
            await conferirFonte(signal);
          },
          externo,
          vida.signal,
          sinal,
        );
      },
    });
  }
  return Object.freeze({ montar, conferir, abrir });
}

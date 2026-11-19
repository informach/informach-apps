import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { BigIntStats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { z } from "zod";

const MAGIA = Buffer.from("RCROFL01", "ascii"),
  IV_BYTES = 12,
  TAG_BYTES = 16,
  CABECALHO_MAX = 768;
const MAX_BYTES = 64 * 1024 * 1024 * 1024,
  BLOCO = 64 * 1024;
const ChaveId = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);
const Contexto = z.strictObject({ tipo: z.literal("backup"), id: z.uuid() });
const Sha = z.string().regex(/^[a-f0-9]{64}$/);
const Cabecalho = z.strictObject({
  versao: z.literal(1),
  chaveId: ChaveId,
  contexto: Contexto,
  bytes: z.number().int().min(0).max(MAX_BYTES),
});
const Referencia = z.strictObject({
  formato: z.literal("recreio-arquivo-cifrado-v1"),
  chaveId: ChaveId,
  contexto: Contexto,
  bytes: z.number().int().min(0).max(MAX_BYTES),
  sha256: Sha,
  sha256Cifrado: Sha,
  bytesCifrados: z
    .number()
    .int()
    .positive()
    .max(MAX_BYTES + 1024),
});
export type ReferenciaDoArquivoCifrado = z.infer<typeof Referencia>;
export class FalhaDoArquivoCifrado extends Error {
  constructor(
    readonly codigo:
      | "CONFIGURACAO"
      | "LIMITE"
      | "INTEGRIDADE"
      | "CHAVE_INDISPONIVEL"
      | "ARQUIVO_ALTERADO"
      | "INTERROMPIDO"
      | "IO"
      | "LIMPEZA",
  ) {
    super(`recreio.encrypted_file.${codigo}`);
    this.name = "FalhaDoArquivoCifrado";
  }
}
export function conferirReferenciaDoArquivoCifrado(bruto: unknown): ReferenciaDoArquivoCifrado {
  const lida = Referencia.safeParse(bruto);
  if (!lida.success) throw new FalhaDoArquivoCifrado("INTEGRIDADE");
  return lida.data;
}
const falhar = (codigo: FalhaDoArquivoCifrado["codigo"]): never => {
  throw new FalhaDoArquivoCifrado(codigo);
};
const conferirPrazo = (signal: AbortSignal) => {
  if (signal.aborted) falhar("INTERROMPIDO");
};
const mesmoArquivo = (a: BigIntStats, b: BigIntStats) => a.dev === b.dev && a.ino === b.ino;
const mesmaOrigem = (a: BigIntStats, b: BigIntStats) =>
  mesmoArquivo(a, b) &&
  a.size === b.size &&
  a.mtimeNs === b.mtimeNs &&
  a.ctimeNs === b.ctimeNs &&
  a.nlink === b.nlink;
const mesmoSha = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

async function metadados(arquivo: FileHandle, teto: number) {
  const info = await arquivo.stat({ bigint: true });
  if (!info.isFile() || info.nlink !== 1n) return falhar("CONFIGURACAO");
  if (info.size < 0n || info.size > BigInt(teto)) return falhar("LIMITE");
  return info;
}
async function* partes(
  arquivo: FileHandle,
  inicio: number,
  quantidade: number,
  signal: AbortSignal,
): AsyncGenerator<Buffer> {
  conferirPrazo(signal);
  if (quantidade === 0) return;
  // Leitura posicional empresta o handle sem criar um stream que possa tomar
  // posse do descritor ao ser destruído, inclusive no cancelamento.
  const buffer = Buffer.alloc(Math.min(BLOCO, quantidade));
  let lidos = 0;
  try {
    while (lidos < quantidade) {
      conferirPrazo(signal);
      const { bytesRead } = await arquivo.read(
        buffer,
        0,
        Math.min(buffer.length, quantidade - lidos),
        inicio + lidos,
      );
      conferirPrazo(signal);
      if (bytesRead === 0) falhar("ARQUIVO_ALTERADO");
      lidos += bytesRead;
      try {
        yield buffer.subarray(0, bytesRead);
      } finally {
        buffer.fill(0);
      }
    }
  } finally {
    buffer.fill(0);
  }
}
async function inventariar(arquivo: FileHandle, info: BigIntStats, signal: AbortSignal) {
  const hash = createHash("sha256");
  for await (const parte of partes(arquivo, 0, Number(info.size), signal)) hash.update(parte);
  if (!mesmaOrigem(info, await arquivo.stat({ bigint: true }))) falhar("ARQUIVO_ALTERADO");
  return hash.digest("hex");
}
async function lerExatos(
  arquivo: FileHandle,
  posicao: number,
  quantidade: number,
  signal: AbortSignal,
) {
  const bytes = Buffer.alloc(quantidade);
  let lidos = 0;
  while (lidos < quantidade) {
    conferirPrazo(signal);
    const passo = await arquivo.read(bytes, lidos, quantidade - lidos, posicao + lidos);
    if (passo.bytesRead === 0) falhar("INTEGRIDADE");
    lidos += passo.bytesRead;
  }
  return bytes;
}
async function escrever(
  destino: FileHandle,
  origem: AsyncIterable<Uint8Array>,
  teto: number,
  signal: AbortSignal,
) {
  const hash = createHash("sha256");
  let escritos = 0;
  for await (const parte of origem) {
    conferirPrazo(signal);
    if (escritos + parte.length > teto) falhar("LIMITE");
    let n = 0;
    while (n < parte.length) {
      conferirPrazo(signal);
      const passo = await destino.write(parte, n, parte.length - n, escritos + n);
      if (passo.bytesWritten === 0) falhar("IO");
      n += passo.bytesWritten;
    }
    hash.update(parte);
    escritos += parte.length;
  }
  await destino.sync();
  conferirPrazo(signal);
  if ((await destino.stat({ bigint: true })).size !== BigInt(escritos)) falhar("ARQUIVO_ALTERADO");
  return { bytes: escritos, sha256: hash.digest("hex") };
}

/** Cifragem de arquivos privados, com memória limitada por blocos. Não aceita
 * caminhos, não abre/fecha handles do chamador, não envia objeto ou autoriza
 * download. O executor só publica a saída depois do retorno bem-sucedido. */
export function criarCifradorDeArquivos(config: {
  chaveAtiva: string;
  chaves: ReadonlyMap<string, Uint8Array>;
  limiteBytes: number;
  tempoLimiteMs: number;
}) {
  if (
    !ChaveId.safeParse(config.chaveAtiva).success ||
    !Number.isSafeInteger(config.limiteBytes) ||
    config.limiteBytes < 1 ||
    config.limiteBytes > MAX_BYTES ||
    !Number.isSafeInteger(config.tempoLimiteMs) ||
    config.tempoLimiteMs < 1 ||
    config.tempoLimiteMs > 900_000 ||
    config.chaves.size < 1 ||
    config.chaves.size > 16
  )
    falhar("CONFIGURACAO");
  const chaves = new Map<string, Buffer>();
  for (const [id, chave] of config.chaves) {
    if (!ChaveId.safeParse(id).success || chave.byteLength !== 32) falhar("CONFIGURACAO");
    chaves.set(id, Buffer.from(chave));
  }
  const chaveAtiva = config.chaveAtiva,
    limiteBytes = config.limiteBytes,
    tempoLimiteMs = config.tempoLimiteMs;
  if (!chaves.has(chaveAtiva)) falhar("CONFIGURACAO");

  async function operacao<T>(
    origem: FileHandle,
    destino: FileHandle,
    teto: number,
    executar: (info: BigIntStats, signal: AbortSignal) => Promise<T>,
    externo?: AbortSignal,
  ): Promise<T> {
    const controle = new AbortController();
    const interromper = () => controle.abort();
    externo?.addEventListener("abort", interromper, { once: true });
    if (externo?.aborted) controle.abort();
    const timer = setTimeout(interromper, tempoLimiteMs);
    timer.unref();
    let admitida = false;
    try {
      conferirPrazo(controle.signal);
      const info = await metadados(origem, teto),
        saida = await metadados(destino, 0);
      if (mesmoArquivo(info, saida) || saida.size !== 0n) falhar("CONFIGURACAO");
      admitida = true;
      return await executar(info, controle.signal);
    } catch (erro) {
      if (admitida) {
        try {
          await destino.truncate(0);
          await destino.sync();
        } catch {
          return falhar("LIMPEZA");
        }
      }
      if (controle.signal.aborted) return falhar("INTERROMPIDO");
      if (erro instanceof FalhaDoArquivoCifrado) throw erro;
      return falhar("IO");
    } finally {
      clearTimeout(timer);
      externo?.removeEventListener("abort", interromper);
    }
  }

  function cifrar(
    origem: FileHandle,
    destino: FileHandle,
    contextoBruto: unknown,
    signal?: AbortSignal,
  ): Promise<ReferenciaDoArquivoCifrado> {
    const contexto = Contexto.safeParse(contextoBruto);
    if (!contexto.success) return Promise.reject(new FalhaDoArquivoCifrado("CONFIGURACAO"));
    return operacao(
      origem,
      destino,
      limiteBytes,
      async (info, prazo): Promise<ReferenciaDoArquivoCifrado> => {
        const shaEsperado = await inventariar(origem, info, prazo),
          bytes = Number(info.size);
        const json = Buffer.from(
          JSON.stringify({ versao: 1, chaveId: chaveAtiva, contexto: contexto.data, bytes }),
        );
        if (json.length > CABECALHO_MAX) falhar("CONFIGURACAO");
        const prefixo = Buffer.alloc(MAGIA.length + 2 + json.length + IV_BYTES);
        MAGIA.copy(prefixo);
        prefixo.writeUInt16BE(json.length, MAGIA.length);
        json.copy(prefixo, MAGIA.length + 2);
        randomBytes(IV_BYTES).copy(prefixo, prefixo.length - IV_BYTES);
        const chave = chaves.get(chaveAtiva);
        if (!chave) return falhar("CHAVE_INDISPONIVEL");
        const cipher = createCipheriv("aes-256-gcm", chave, prefixo.subarray(-IV_BYTES), {
          authTagLength: TAG_BYTES,
        });
        cipher.setAAD(prefixo);
        const sha = createHash("sha256");
        async function* envelope() {
          try {
            yield prefixo;
            for await (const parte of partes(origem, 0, bytes, prazo)) {
              sha.update(parte);
              yield cipher.update(parte);
            }
            yield cipher.final();
            yield cipher.getAuthTag();
          } finally {
            cipher.destroy();
          }
        }
        const guardado = await escrever(destino, envelope(), bytes + 1024, prazo);
        if (
          guardado.bytes !== prefixo.length + bytes + TAG_BYTES ||
          !mesmoSha(sha.digest("hex"), shaEsperado) ||
          !mesmaOrigem(info, await origem.stat({ bigint: true }))
        )
          falhar("ARQUIVO_ALTERADO");
        conferirPrazo(prazo);
        return {
          formato: "recreio-arquivo-cifrado-v1",
          chaveId: chaveAtiva,
          contexto: contexto.data,
          bytes,
          sha256: shaEsperado,
          sha256Cifrado: guardado.sha256,
          bytesCifrados: guardado.bytes,
        };
      },
      signal,
    );
  }
  function abrir(
    origem: FileHandle,
    destino: FileHandle,
    bruto: unknown,
    signal?: AbortSignal,
  ): Promise<void> {
    const lido = Referencia.safeParse(bruto);
    if (!lido.success) return Promise.reject(new FalhaDoArquivoCifrado("INTEGRIDADE"));
    const r = lido.data;
    if (r.bytes > limiteBytes || r.bytesCifrados > limiteBytes + 1024)
      return Promise.reject(new FalhaDoArquivoCifrado("LIMITE"));
    const chave = chaves.get(r.chaveId);
    if (!chave) return Promise.reject(new FalhaDoArquivoCifrado("CHAVE_INDISPONIVEL"));
    return operacao(
      origem,
      destino,
      limiteBytes + 1024,
      async (info, prazo) => {
        if (
          Number(info.size) !== r.bytesCifrados ||
          r.bytesCifrados < MAGIA.length + 2 + IV_BYTES + TAG_BYTES + 2 ||
          !mesmoSha(await inventariar(origem, info, prazo), r.sha256Cifrado)
        )
          falhar("INTEGRIDADE");
        const inicio = await lerExatos(origem, 0, MAGIA.length + 2, prazo);
        if (!inicio.subarray(0, MAGIA.length).equals(MAGIA)) falhar("INTEGRIDADE");
        const tamanho = inicio.readUInt16BE(MAGIA.length);
        if (tamanho < 2 || tamanho > CABECALHO_MAX) falhar("INTEGRIDADE");
        const resto = await lerExatos(origem, inicio.length, tamanho + IV_BYTES, prazo),
          prefixo = Buffer.concat([inicio, resto]);
        let json: unknown;
        try {
          json = JSON.parse(resto.subarray(0, tamanho).toString("utf8"));
        } catch {
          return falhar("INTEGRIDADE");
        }
        const header = Cabecalho.safeParse(json);
        if (
          !header.success ||
          header.data.chaveId !== r.chaveId ||
          header.data.bytes !== r.bytes ||
          header.data.contexto.id !== r.contexto.id ||
          prefixo.length + r.bytes + TAG_BYTES !== r.bytesCifrados
        )
          falhar("INTEGRIDADE");
        const tag = await lerExatos(origem, r.bytesCifrados - TAG_BYTES, TAG_BYTES, prazo);
        const decipher = createDecipheriv("aes-256-gcm", chave, prefixo.subarray(-IV_BYTES), {
          authTagLength: TAG_BYTES,
        });
        decipher.setAAD(prefixo);
        decipher.setAuthTag(tag);
        const cifrado = createHash("sha256");
        cifrado.update(prefixo);
        async function* conteudo() {
          try {
            for await (const parte of partes(origem, prefixo.length, r.bytes, prazo)) {
              cifrado.update(parte);
              const aberto = decipher.update(parte);
              try {
                yield aberto;
              } finally {
                aberto.fill(0);
              }
            }
            let final: Buffer;
            try {
              final = decipher.final();
            } catch {
              return falhar("INTEGRIDADE");
            }
            try {
              yield final;
            } finally {
              final.fill(0);
            }
          } finally {
            decipher.destroy();
          }
        }
        const aberto = await escrever(destino, conteudo(), r.bytes, prazo);
        cifrado.update(tag);
        if (
          aberto.bytes !== r.bytes ||
          !mesmoSha(aberto.sha256, r.sha256) ||
          !mesmoSha(cifrado.digest("hex"), r.sha256Cifrado)
        )
          falhar("INTEGRIDADE");
        if (!mesmaOrigem(info, await origem.stat({ bigint: true }))) falhar("ARQUIVO_ALTERADO");
        conferirPrazo(prazo);
      },
      signal,
    );
  }
  return Object.freeze({ cifrar, abrir, limiteBytes });
}

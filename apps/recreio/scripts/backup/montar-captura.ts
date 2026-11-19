import type { FileHandle } from "node:fs/promises";
import type { CapturaAberta } from "../../src/features/backup/captura-repository";
import {
  type DestinoDeCaptura,
  DestinoDeCapturaSchema,
  FalhaDaCaptura,
  type ObjetoDaCaptura,
} from "../../src/features/backup/contrato";
import { criarArquivoComposto } from "./arquivo-composto";
import { criarGravadorDeDump } from "./dump-snapshot";
import { inventariarBackup } from "./inventario";

type Arquivos = {
  dump: FileHandle;
  inventario: FileHandle;
  fotografia: FileHandle;
  composto: FileHandle;
};
function exigir(sim: unknown, codigo: FalhaDaCaptura["codigo"]): asserts sim {
  if (!sim) throw new FalhaDaCaptura(codigo);
}
async function escrever(h: FileHandle, b: Buffer, signal: AbortSignal) {
  let pos = 0;
  while (pos < b.length) {
    exigir(!signal.aborted, "CAPTURA_ENCERRADA");
    const r = await h.write(b, pos, b.length - pos, pos);
    exigir(r.bytesWritten > 0, "INVENTARIO");
    pos += r.bytesWritten;
  }
  await h.sync();
  exigir(!signal.aborted, "CAPTURA_ENCERRADA");
}

/** Liga captura/pg_dump/inventário/envelopes ao formato conferido. O executor
 * fornece capacidades privadas vazias, conexão admitida e leitor do destino
 * exato. `carregar` transfere a posse de um Buffer cifrado ao montador.
 * Não cifra o composto, faz PUT, publica índice ou libera reservas. */
export function criarMontadorDaCaptura(config: {
  conexao: string;
  limiteBytes: number;
  limiteFotografiaBytes: number;
  tempoLimiteMs: number;
  leitor: {
    destino: DestinoDeCaptura;
    carregar: (objeto: ObjetoDaCaptura, signal: AbortSignal) => Promise<Buffer>;
  };
}) {
  const { limiteFotografiaBytes } = config,
    destino = DestinoDeCapturaSchema.parse(config.leitor.destino),
    carregar = config.leitor.carregar;
  const dumpador = criarGravadorDeDump(config),
    composto = criarArquivoComposto(config);
  async function montar(
    c: CapturaAberta,
    entrada: Arquivos,
    chaveiro: ReadonlyMap<string, Uint8Array>,
  ) {
    const arquivos = { ...entrada },
      handles = Object.values(arquivos),
      identidades = new Set<string>();
    exigir(!c.signal.aborted, "CAPTURA_ENCERRADA");
    for (const h of handles) {
      const s = await h.stat({ bigint: true }),
        id = `${s.dev}:${s.ino}`;
      exigir(
        s.isFile() &&
          s.nlink === 1n &&
          s.size === 0n &&
          (s.mode & 0o077n) === 0n &&
          !identidades.has(id),
        "CONFIGURACAO",
      );
      identidades.add(id);
    }
    exigir(chaveiro.size <= 16, "CONFIGURACAO");
    const chaves = new Map<string, Buffer>();
    let resultado: Awaited<ReturnType<typeof composto.montar>> | undefined, falha: unknown;
    try {
      for (const [id, material] of chaveiro) {
        exigir(
          /^[A-Za-z0-9._-]{1,64}$/.test(id) &&
            material instanceof Uint8Array &&
            material.length === 32,
          "CONFIGURACAO",
        );
        chaves.set(id, Buffer.from(material));
      }
      const usadas = new Map<string, Buffer>();
      for await (const objeto of c.objetos()) {
        exigir(
          objeto.bucketId === destino.bucketId &&
            objeto.bucketName === destino.bucketName &&
            objeto.escopo === destino.escopo,
          "INVENTARIO",
        );
        exigir(objeto.referencia.bytes <= limiteFotografiaBytes, "LIMITE");
        const chave = chaves.get(objeto.referencia.chaveId);
        exigir(chave, "CONFIGURACAO");
        usadas.set(objeto.referencia.chaveId, chave);
      }
      const banco = JSON.stringify(await inventariarBackup(c.origem));
      exigir(Buffer.byteLength(banco, "utf8") <= 512 * 1024, "LIMITE");
      const bancoBytes = Buffer.from(banco);
      try {
        await escrever(arquivos.inventario, bancoBytes, c.signal);
      } finally {
        bancoBytes.fill(0);
      }
      await dumpador.gravar(c, arquivos.dump);
      async function* objetos() {
        for await (const objeto of c.objetos()) {
          exigir(!c.signal.aborted, "CAPTURA_ENCERRADA");
          const envelope = await carregar(objeto, c.signal);
          try {
            exigir(envelope.length === objeto.referencia.bytesCifrados, "INVENTARIO");
            await escrever(arquivos.fotografia, envelope, c.signal);
            yield { objeto, arquivo: arquivos.fotografia };
          } finally {
            envelope.fill(0);
            await arquivos.fotografia.truncate(0);
            await arquivos.fotografia.sync();
          }
        }
      }
      resultado = await composto.montar(
        {
          capturaId: c.id,
          inventario: c.inventario,
          dump: arquivos.dump,
          inventarioBanco: arquivos.inventario,
          chaves: usadas,
          objetos: objetos(),
        },
        arquivos.composto,
        c.signal,
      );
      exigir(!c.signal.aborted, "CAPTURA_ENCERRADA");
    } catch (e) {
      falha = e;
    } finally {
      for (const k of chaves.values()) k.fill(0);
      chaves.clear();
    }
    // Somente capacidades admitidas vazias são limpas. Na saída bem-sucedida
    // resta apenas o composto privado, que o executor ainda precisa cifrar.
    const limpar =
      falha || !resultado ? handles : [arquivos.dump, arquivos.inventario, arquivos.fotografia];
    const limpeza = await Promise.allSettled(
      limpar.map(async (h) => {
        await h.truncate(0);
        await h.sync();
      }),
    );
    if (limpeza.some((r) => r.status === "rejected")) {
      // Uma falha de limpeza impede reportar a montagem como concluída.
      throw new AggregateError(
        [...(falha ? [falha] : []), new FalhaDaCaptura("LIMPEZA")],
        "backup_capture.cleanup_failed",
      );
    }
    if (falha) throw falha;
    exigir(resultado, "INVENTARIO");
    return resultado;
  }
  return Object.freeze({ montar });
}

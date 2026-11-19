import { createHash } from "node:crypto";
import { z } from "zod";
import { conferirReferenciaDoObjeto } from "@/features/objetos/criptografia";

// Par de int32: também permite conferir o proprietário em pg_locks sem hash.
export const BARREIRA_CAPTURA_COLETA = Object.freeze({ grupo: 1_380_270_930, chave: 8 });
export const DestinoDeCapturaSchema = z.strictObject({
  bucketId: z.uuid(),
  bucketName: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  escopo: z.enum(["qualification", "production"]),
});
export type DestinoDeCaptura = z.infer<typeof DestinoDeCapturaSchema>;
export class FalhaDaCaptura extends Error {
  constructor(
    readonly codigo:
      | "CONFIGURACAO"
      | "INVENTARIO"
      | "LIMITE"
      | "FONTE_ALTERADA"
      | "CAPTURA_ENCERRADA"
      | "LIMPEZA",
  ) {
    super(`recreio.backup.${codigo}`);
  }
}
const ObjetoSchema = z.strictObject({
  entregaId: z.uuid(),
  fotografiaId: z.uuid(),
  mundoId: z.uuid(),
  bucketId: z.uuid(),
  bucketName: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  escopo: z.enum(["qualification", "production"]),
  objectKey: z.string().max(200),
  referencia: z.unknown(),
});

/** Ordem canônica, sem nome de mundo/jogador; preserva destino e referência
 * completa. Hash não é anonimização nem autorização para ler o objeto. */
export function conferirObjetoDaCaptura(bruto: unknown) {
  const resultado = ObjetoSchema.safeParse(bruto);
  if (!resultado.success) throw new FalhaDaCaptura("INVENTARIO");
  const v = resultado.data;
  const r = conferirReferenciaDoObjeto(v.referencia);
  if (
    r.contexto.tipo !== "fotografia" ||
    r.contexto.id !== v.mundoId ||
    v.objectKey !== `recreio/v1/fotografia/${v.mundoId}/${r.sha256Cifrado}`
  )
    throw new FalhaDaCaptura("INVENTARIO");
  return {
    entregaId: v.entregaId,
    fotografiaId: v.fotografiaId,
    mundoId: v.mundoId,
    bucketId: v.bucketId,
    bucketName: v.bucketName,
    escopo: v.escopo,
    objectKey: v.objectKey,
    referencia: {
      formato: r.formato,
      chaveId: r.chaveId,
      contexto: { tipo: r.contexto.tipo, id: r.contexto.id },
      bytes: r.bytes,
      sha256: r.sha256,
      sha256Cifrado: r.sha256Cifrado,
      bytesCifrados: r.bytesCifrados,
    },
  };
}
export type ObjetoDaCaptura = ReturnType<typeof conferirObjetoDaCaptura>;
export function resumoDaReferencia(objeto: ObjetoDaCaptura) {
  return createHash("sha256")
    .update(JSON.stringify(conferirObjetoDaCaptura(objeto)))
    .digest("hex");
}

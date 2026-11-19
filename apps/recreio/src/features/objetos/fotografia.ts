import "server-only";
import { createHash } from "node:crypto";
import { ErroDoRecreio } from "@informach/recreio";
import type {
  LeitorDeFotografiasPrivadas,
  ReferenciaDeFotografia,
} from "@/features/posse/armazenamento";

/** Somente materialização. Quem chama admite autoridade antes e a relê depois.
 * Nunca usar dentro da transação que mantém a trava do mundo. */
export async function materializarFotografia(
  fonte: ReferenciaDeFotografia,
  leitor: LeitorDeFotografiasPrivadas | null,
): Promise<Uint8Array> {
  if (fonte.origem.tipo === "pg") return fonte.origem.bytes;
  const origem = fonte.origem;
  if (
    !leitor ||
    leitor.bucketId !== origem.bucketId ||
    leitor.bucketName !== origem.bucketName ||
    leitor.escopo !== origem.escopo
  )
    throw new ErroDoRecreio("INDISPONIVEL");
  let bytes: Uint8Array;
  try {
    bytes = await leitor.ler(origem.objeto);
  } catch {
    throw new ErroDoRecreio("INDISPONIVEL");
  }
  if (
    bytes.length !== fonte.meta.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== fonte.meta.sha256
  ) {
    bytes.fill(0);
    throw new ErroDoRecreio("INDISPONIVEL");
  }
  return bytes;
}

/** Compara identidade e referência opaca sem serializar os bytes de pg. */
export function mesmaFotografia(a: ReferenciaDeFotografia, b: ReferenciaDeFotografia): boolean {
  if (
    a.id !== b.id ||
    JSON.stringify(a.meta) !== JSON.stringify(b.meta) ||
    a.origem.tipo !== b.origem.tipo
  )
    return false;
  if (a.origem.tipo === "pg") return true;
  return b.origem.tipo === "bucket" && JSON.stringify(a.origem) === JSON.stringify(b.origem);
}

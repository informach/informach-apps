import { type PlanoDeDireitos, PlanoDeDireitosSchema } from "../preparacao-contrato";
import { resumoDoRegistro } from "./assinatura";
import { FalhaDoLivroDeDireitos, ShaDoLivroSchema } from "./contrato";

export const MAX_PLANO_EXTERNO = 256 * 1024;
/** O SHA é autenticado pela intenção assinada, não fornecido por uma URL ou
 * nome livre. O objeto externo conserva a seleção original mesmo restaurando
 * um banco anterior à preparação/consentimento. Não contém nomes ou e-mails. */
export function lerPlanoExterno(bytes: Uint8Array, sha256: string): PlanoDeDireitos {
  const falhar = (): never => {
    throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
  };
  if (
    !ShaDoLivroSchema.safeParse(sha256).success ||
    bytes.byteLength < 1 ||
    bytes.byteLength > MAX_PLANO_EXTERNO ||
    resumoDoRegistro(bytes) !== sha256
  )
    return falhar();
  let bruto: unknown, texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    bruto = JSON.parse(texto);
  } catch {
    return falhar();
  }
  const plano = PlanoDeDireitosSchema.safeParse(bruto);
  if (!plano.success || JSON.stringify(plano.data) !== texto) return falhar();
  return plano.data;
}
export function serializarPlanoExterno(plano: PlanoDeDireitos, sha256: string) {
  const bytes = Buffer.from(JSON.stringify(plano));
  try {
    lerPlanoExterno(bytes, sha256);
    return bytes;
  } catch (erro) {
    bytes.fill(0);
    throw erro;
  }
}

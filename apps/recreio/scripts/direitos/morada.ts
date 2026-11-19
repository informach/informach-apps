import "server-only";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { jogoPorId } from "@informach/config/jogos";
import { prepararFotografiaEResumoPessoaisDoMorada } from "@informach/morada-sim/direitos";
import {
  conferirMetadadosDaFotografia,
  FOTOGRAFIA_ABERTA_MAX_BYTES,
} from "@informach/morada-sim/formatos";
import { MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";

const Meta = z.strictObject({
  mundoId: MundoIdSchema,
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  tick: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive(),
});
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export class FalhaDaPreparacaoDeFotoPessoal extends Error {
  constructor(readonly codigo: "CONFIGURACAO" | "LIMITE" | "INTEGRIDADE") {
    super(`recreio.privacy_photo.${codigo}`);
  }
}
function limiteDeBytes() {
  const limite = jogoPorId("morada")?.limites.fotografiaMaxBytes;
  if (!limite || !Number.isSafeInteger(limite) || limite <= 0)
    throw new FalhaDaPreparacaoDeFotoPessoal("CONFIGURACAO");
  return limite;
}
function falhaDeCompactacao(erro: unknown): never {
  if (erro && typeof erro === "object" && "code" in erro && erro.code === "ERR_BUFFER_TOO_LARGE")
    throw new FalhaDaPreparacaoDeFotoPessoal("LIMITE");
  throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
}

/** Bytes privados já admitidos pelo leitor nativo; não recebe URL ou chave de
 * objeto. Preparação sem efeitos: a publicação exige consentimento e releitura
 * de posse/revisão sob as travas do coordenador. Persistir os bytes exatos antes
 * de I/O, em vez de depender de recompressão idêntica entre runtimes. */
export function prepararFotoPessoalDoMorada(
  bytes: Uint8Array,
  metadados: unknown,
  perfilBruto: unknown,
  politica: { retirarTextosDaFundacao: boolean },
) {
  const meta = Meta.parse(metadados),
    perfilId = PerfilIdSchema.parse(perfilBruto),
    limite = limiteDeBytes();
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > limite || meta.bytes > limite)
    throw new FalhaDaPreparacaoDeFotoPessoal("LIMITE");
  const copia = Buffer.from(bytes);
  if (copia.byteLength !== meta.bytes || sha(copia) !== meta.sha256)
    throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
  let aberto: Buffer;
  try {
    aberto = gunzipSync(copia, { maxOutputLength: FOTOGRAFIA_ABERTA_MAX_BYTES });
  } catch (erro) {
    falhaDeCompactacao(erro);
  }
  let foto: unknown;
  try {
    const texto = new TextDecoder("utf-8", { fatal: true }).decode(aberto);
    foto = JSON.parse(texto);
    // O writer nativo usa JSON.stringify. Duplicação de chave/normalização
    // oculta não pode desaparecer silenciosamente numa retirada pessoal.
    if (JSON.stringify(foto) !== texto) throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
  } catch {
    throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
  }
  if (
    !conferirMetadadosDaFotografia(foto, {
      mundoId: meta.mundoId,
      tick: meta.tick,
      versaoDoMundo: meta.schemaVersion,
    })
  )
    throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
  const { fotografia: retirada, resumo } = prepararFotografiaEResumoPessoaisDoMorada(
    foto,
    perfilId,
    politica,
  );
  const texto = JSON.stringify(retirada);
  if (Buffer.byteLength(texto) > FOTOGRAFIA_ABERTA_MAX_BYTES)
    throw new FalhaDaPreparacaoDeFotoPessoal("LIMITE");
  let resultado: Buffer;
  try {
    resultado = gzipSync(texto, { maxOutputLength: limite });
  } catch (erro) {
    falhaDeCompactacao(erro);
  }
  return {
    bytes: resultado,
    sha256: sha(resultado),
    schemaVersion: meta.schemaVersion,
    tick: meta.tick,
    resumo,
  };
}

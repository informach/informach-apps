import "server-only";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { jogoPorId } from "@informach/config/jogos";
import type { Fato } from "@informach/morada-sim";
import { lerFatoDoDiario } from "@informach/morada-sim/diario";
import {
  prepararFotografiaEResumoPessoaisDoMorada,
  prepararRecuperacaoNaFotografiaDoMorada,
} from "@informach/morada-sim/direitos";
import {
  conferirMetadadosDaFotografia,
  FOTOGRAFIA_ABERTA_MAX_BYTES,
} from "@informach/morada-sim/formatos";
import { MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import type { ResumoDoMundo } from "@informach/recreio/contrato";
import { DIARIO_RECUPERACAO_MAX_ENTRADAS } from "@informach/recreio/contrato";
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
  const perfilId = PerfilIdSchema.parse(perfilBruto);
  return prepararFotografia(bytes, metadados, (foto) =>
    prepararFotografiaEResumoPessoaisDoMorada(foto, perfilId, politica),
  );
}

export function prepararRecuperacaoDoMorada(
  bytes: Uint8Array,
  metadados: unknown,
  diario: {
    diarioFonte: number;
    diarioFinal: number;
    entradas: readonly { seq: number; tick: number; fatoId: string; bytes: Uint8Array }[];
  },
) {
  const contador = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
  const inicio = contador.parse(diario.diarioFonte),
    fim = contador.parse(diario.diarioFinal);
  const limite = jogoPorId("morada")?.limites.diarioPendenteMaxBytes;
  if (!limite || !Number.isSafeInteger(limite))
    throw new FalhaDaPreparacaoDeFotoPessoal("CONFIGURACAO");
  if (
    diario.entradas.length > DIARIO_RECUPERACAO_MAX_ENTRADAS ||
    diario.entradas.reduce((n, e) => n + e.bytes.byteLength, 0) > limite
  )
    throw new FalhaDaPreparacaoDeFotoPessoal("LIMITE");
  return prepararFotografia(bytes, metadados, (foto, meta) => {
    let seq = inicio,
      tick = meta.tick;
    const fatos: Fato[] = [];
    for (const entrada of diario.entradas) {
      if (entrada.seq !== ++seq || entrada.seq > fim || entrada.tick < tick)
        throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
      const fato = lerFatoDoDiario(new TextDecoder("utf-8", { fatal: true }).decode(entrada.bytes));
      if (fato.id !== entrada.fatoId || fato.tick !== entrada.tick)
        throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
      tick = fato.tick;
      fatos.push(fato);
    }
    if (seq !== fim) throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
    return prepararRecuperacaoNaFotografiaDoMorada(foto, fatos);
  });
}

function prepararFotografia(
  bytes: Uint8Array,
  metadados: unknown,
  transformar: (
    foto: unknown,
    meta: z.infer<typeof Meta>,
  ) => { fotografia: { tick: number }; resumo: ResumoDoMundo },
) {
  const meta = Meta.parse(metadados),
    limite = limiteDeBytes();
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > limite || meta.bytes > limite)
    throw new FalhaDaPreparacaoDeFotoPessoal("LIMITE");
  const copia = Buffer.from(bytes);
  let aberto: Buffer | undefined, resultado: Buffer | undefined;
  try {
    if (copia.byteLength !== meta.bytes || sha(copia) !== meta.sha256)
      throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
    try {
      aberto = gunzipSync(copia, { maxOutputLength: FOTOGRAFIA_ABERTA_MAX_BYTES });
    } catch (erro) {
      falhaDeCompactacao(erro);
    }
    let foto: unknown;
    try {
      const texto = new TextDecoder("utf-8", { fatal: true }).decode(aberto);
      foto = JSON.parse(texto);
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
    const { fotografia, resumo } = transformar(foto, meta);
    if (
      !conferirMetadadosDaFotografia(fotografia, {
        mundoId: meta.mundoId,
        tick: fotografia.tick,
        versaoDoMundo: meta.schemaVersion,
      })
    )
      throw new FalhaDaPreparacaoDeFotoPessoal("INTEGRIDADE");
    const texto = JSON.stringify(fotografia);
    if (Buffer.byteLength(texto) > FOTOGRAFIA_ABERTA_MAX_BYTES)
      throw new FalhaDaPreparacaoDeFotoPessoal("LIMITE");
    try {
      resultado = gzipSync(texto, { maxOutputLength: limite });
    } catch (erro) {
      falhaDeCompactacao(erro);
    }
    return {
      bytes: resultado,
      sha256: sha(resultado),
      schemaVersion: meta.schemaVersion,
      tick: fotografia.tick,
      resumo,
    };
  } catch (erro) {
    resultado?.fill(0);
    throw erro;
  } finally {
    copia.fill(0);
    aberto?.fill(0);
  }
}

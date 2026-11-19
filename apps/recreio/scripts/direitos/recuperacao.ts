import { FalhaDeFatoDuravel } from "@informach/morada-sim/diario";
import { FalhaDaRetiradaDoMorada } from "@informach/morada-sim/direitos";
import { ZodError } from "zod";
import type { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import type { criarAssinaturaDoLivro } from "../../src/features/direitos/livro/assinatura";
import { conferirPrefixoDoLivro } from "../../src/features/direitos/livro/leitura";
import {
  confirmarRecuperacaoDeDireitos,
  prepararRecuperacaoDeDireitos,
  revisarRecuperacaoDeDireitos,
} from "../../src/features/direitos/recuperacao-diario-repository";
import { materializarFotografia } from "../../src/features/objetos/fotografia";
import type { LeitorDeFotografiasPrivadas } from "../../src/features/posse/armazenamento";
import {
  type MaterialDeRecuperacao,
  montarMaterial,
  RecusaDeRecuperacao,
} from "../../src/features/recuperacao/repository";
import { FalhaDaPreparacaoDeFotoPessoal, prepararRecuperacaoDoMorada } from "./morada";

/** Recupera o commit durável que o host perdeu antes da foto. Não avança
 * relógio, não inventa fatos e não compacta o diário. Confirmação otimista
 * relê toda a impressão; uma segunda preparação nunca cria outra revisão. */
export async function recuperarProximoDiarioDeDireitos(config: {
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  leitor: LeitorDeFotografiasPrivadas | null;
}) {
  const coordenacao = async () => ({
    assinatura: config.assinatura,
    prova: await conferirPrefixoDoLivro({
      storage: config.storage,
      maxEntradas: 100_000,
      tempoLimiteMs: 30_000,
    }),
  });
  const reserva = await prepararRecuperacaoDeDireitos(await coordenacao());
  if (!("tipo" in reserva)) return reserva;
  let bytes: Uint8Array | undefined,
    material: MaterialDeRecuperacao | undefined,
    resultado: ReturnType<typeof prepararRecuperacaoDoMorada> | undefined;
  try {
    bytes = await materializarFotografia(reserva.base.fonte, config.leitor);
    material = montarMaterial(reserva.base, bytes);
    resultado = prepararRecuperacaoDoMorada(
      bytes,
      {
        mundoId: material.mundo.id,
        schemaVersion: material.foto.schemaVersion,
        tick: material.foto.tick,
        sha256: material.foto.sha256,
        bytes: bytes.byteLength,
      },
      {
        diarioFonte: material.foto.journalSeq,
        diarioFinal: material.mundo.journalSeq,
        entradas: material.entradas,
      },
    );
    const confirmada = await confirmarRecuperacaoDeDireitos(
      await coordenacao(),
      reserva,
      material,
      resultado,
    );
    return {
      situacao: confirmada ? ("diario_recuperado" as const) : ("posse_perdida" as const),
      operacaoId: reserva.operacao.id,
    };
  } catch (erro) {
    if (
      erro instanceof RecusaDeRecuperacao &&
      ["MATERIAL_ALTERADO", "MUNDO_NAO_PARADO"].includes(erro.codigo)
    )
      return { situacao: "posse_perdida" as const, operacaoId: reserva.operacao.id };
    const integridade =
      erro instanceof FalhaDeFatoDuravel ||
      erro instanceof FalhaDaRetiradaDoMorada ||
      erro instanceof FalhaDaPreparacaoDeFotoPessoal ||
      erro instanceof ZodError;
    if (integridade && material) {
      let marcada: boolean;
      try {
        marcada = await revisarRecuperacaoDeDireitos(await coordenacao(), reserva, material);
      } catch (falhaDaRevisao) {
        throw new AggregateError(
          [erro, falhaDaRevisao],
          "Falha da recuperação e da revisão nativa.",
        );
      }
      return {
        situacao: marcada ? ("revisao" as const) : ("posse_perdida" as const),
        operacaoId: reserva.operacao.id,
      };
    }
    throw erro;
  } finally {
    bytes?.fill(0);
    resultado?.bytes.fill(0);
    if (reserva.base.fonte.origem.tipo === "pg") reserva.base.fonte.origem.bytes.fill(0);
    for (const e of reserva.base.entradas) e.bytes.fill(0);
  }
}

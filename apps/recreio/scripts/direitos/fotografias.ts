import { FalhaDaRetiradaDoMorada } from "@informach/morada-sim/direitos";
import { ErroDoRecreio } from "@informach/recreio";
import { ZodError } from "zod";
import {
  compactarDiarioDeDireitos,
  confirmarFotografiaDeDireitos,
  reservarFotografiaDeDireitos,
  revisarFotografiaDeDireitos,
} from "../../src/features/direitos/fotografias-repository";
import type { criarArmazenamentoDoLivro } from "../../src/features/direitos/livro/armazenamento";
import type { criarAssinaturaDoLivro } from "../../src/features/direitos/livro/assinatura";
import { conferirPrefixoDoLivro } from "../../src/features/direitos/livro/leitura";
import { materializarFotografia } from "../../src/features/objetos/fotografia";
import type { LeitorDeFotografiasPrivadas } from "../../src/features/posse/armazenamento";
import { AppError } from "../../src/lib/errors";
import { FalhaDaPreparacaoDeFotoPessoal, prepararFotoPessoalDoMorada } from "./morada";

/** Composição operacional fora do grafo Next. Uma foto por passagem; o
 * chamador cuida do agendamento, custódia, alertas e credenciais restritas.
 * Nenhum resultado desta etapa representa retirada completa do perfil. */
export async function processarProximaFotografiaDeDireitos(config: {
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  leitor: LeitorDeFotografiasPrivadas | null;
  politica: { retirarTextosDaFundacao: boolean };
}) {
  const prova = await conferirPrefixoDoLivro({
    storage: config.storage,
    maxEntradas: 100_000,
    tempoLimiteMs: 30_000,
  });
  const reserva = await reservarFotografiaDeDireitos({ prova, assinatura: config.assinatura });
  if (!reserva) return compactarDiarioDeDireitos({ prova, assinatura: config.assinatura });
  if (reserva.tipo === "fotos_prontas")
    return { situacao: "dependencias" as const, operacaoId: reserva.operacaoId };
  let bytes: Uint8Array | undefined,
    resultado: ReturnType<typeof prepararFotoPessoalDoMorada> | undefined;
  try {
    const perfil = reserva.selecionados[0];
    if (
      reserva.mundo.gameId !== "morada" ||
      reserva.operacao.kind !== "retirar_perfil" ||
      reserva.selecionados.length !== 1 ||
      !perfil
    )
      throw new AppError("DIREITOS_ADAPTER", "Adapter da retirada não disponível.");
    bytes = await materializarFotografia(reserva.fonte, config.leitor);
    resultado = prepararFotoPessoalDoMorada(
      bytes,
      {
        mundoId: reserva.mundo.id,
        schemaVersion: reserva.fonte.meta.schemaVersion,
        tick: reserva.fonte.meta.tick,
        sha256: reserva.fonte.meta.sha256,
        bytes: reserva.fonte.meta.bytes,
      },
      perfil.id,
      config.politica,
    );
    await confirmarFotografiaDeDireitos(reserva, resultado);
    return { situacao: "fotografia_processada" as const, operacaoId: reserva.operacao.id };
  } catch (erro) {
    if (erro instanceof AppError && erro.code === "DIREITOS_POSSE")
      return { situacao: "posse_perdida" as const, operacaoId: reserva.operacao.id };
    const integridade =
      erro instanceof FalhaDaPreparacaoDeFotoPessoal ||
      erro instanceof FalhaDaRetiradaDoMorada ||
      erro instanceof ZodError ||
      (erro instanceof AppError && erro.code === "DIREITOS_INTEGRIDADE");
    const dependencia =
      (erro instanceof AppError && erro.code === "DIREITOS_ADAPTER") ||
      (erro instanceof ErroDoRecreio && erro.codigo === "INDISPONIVEL");
    if (!integridade && !dependencia) throw erro;
    const marcada = await revisarFotografiaDeDireitos(
      reserva,
      integridade ? "integrity" : "dependency",
    );
    return {
      situacao: marcada ? ("revisao" as const) : ("posse_perdida" as const),
      operacaoId: reserva.operacao.id,
    };
  } finally {
    bytes?.fill(0);
    resultado?.bytes.fill(0);
    if (reserva.fonte.origem.tipo === "pg") reserva.fonte.origem.bytes.fill(0);
  }
}

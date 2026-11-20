import { FalhaDaRetiradaDoMorada } from "@informach/morada-sim/direitos";
import { ErroDoRecreio } from "@informach/recreio";
import { ZodError } from "zod";
import {
  type CoordenacaoDeEfeitos,
  conferirLeitorDaCoordenacao,
  reconferirCoordenacaoDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
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
import { FalhaDaPreparacaoDeFotoPessoal, prepararFotoDePerfisDoMorada } from "./morada";

/** Composição operacional fora do grafo Next. Uma foto por passagem; o
 * chamador cuida do agendamento, custódia, alertas e credenciais restritas.
 * Nenhum resultado desta etapa representa retirada completa do perfil. */
type OpcoesDeFotografia = {
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  leitor: LeitorDeFotografiasPrivadas | null;
  politica: { retirarTextosDaFundacao: boolean };
};
export async function processarProximaFotografiaDeDireitos(
  config: OpcoesDeFotografia & {
    assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  },
) {
  const prova = await conferirPrefixoDoLivro({
    storage: config.storage,
    maxEntradas: 100000,
    tempoLimiteMs: 30000,
  });
  return processarFotografiaNaCoordenacao({ assinatura: config.assinatura, prova }, config);
}

/** Same operational adapter for normal jobs and an actual scoped recovery.
 * No caller flag can convert an ordinary frozen config into private authority. */
export async function processarFotografiaNaCoordenacao(
  coordenacao: CoordenacaoDeEfeitos,
  config: OpcoesDeFotografia,
) {
  conferirLeitorDaCoordenacao(coordenacao, config.leitor);
  const reserva = await reservarFotografiaDeDireitos(coordenacao);
  if (!reserva) return compactarDiarioDeDireitos(coordenacao);
  if (reserva.tipo === "fotos_prontas")
    return { situacao: "dependencias" as const, operacaoId: reserva.operacaoId };
  let bytes: Uint8Array | undefined,
    resultado: ReturnType<typeof prepararFotoDePerfisDoMorada> | undefined;
  try {
    if (
      reserva.mundo.gameId !== "morada" ||
      reserva.selecionados.length === 0 ||
      reserva.selecionados.length > 256
    )
      throw new AppError("DIREITOS_ADAPTER", "Adapter da retirada não disponível.");
    bytes = await materializarFotografia(reserva.fonte, config.leitor);
    resultado = prepararFotoDePerfisDoMorada(
      bytes,
      {
        mundoId: reserva.mundo.id,
        schemaVersion: reserva.fonte.meta.schemaVersion,
        tick: reserva.fonte.meta.tick,
        sha256: reserva.fonte.meta.sha256,
        bytes: reserva.fonte.meta.bytes,
      },
      reserva.selecionados.map((p) => p.id),
      config.politica,
    );
    const atual = await reconferirCoordenacaoDeDireitos(coordenacao, config.storage);
    await confirmarFotografiaDeDireitos(reserva, resultado, atual);
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
      coordenacao,
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

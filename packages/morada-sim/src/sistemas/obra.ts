import type { AcaoPedida } from "../comandos/intencao";
import type { Resultado, Sessao } from "../dominio/tipos";
import { derivarAlvoDaObra } from "./alvo-da-obra";
import { type Contexto, tocarChave } from "./contexto";
import { temPermissao } from "./presenca";
import { adquirirTrava, liberarTrava, renovarTrava } from "./travas-de-edicao";

type AcaoDaObra = Extract<AcaoPedida, { t: "preparar_obra" | "renovar_obra" | "liberar_obra" }>;

/** Toda chamada exige sessão atual e passa fora da memória de comandos duráveis. */
export function executarObra(
  ctx: Contexto,
  sessao: Sessao,
  comandoId: string,
  acao: AcaoDaObra,
): Resultado {
  const registro = ctx.presenca.obra;
  if (!registro)
    return { ok: false, comandoId, motivo: "politica_do_mundo", detalhe: "obra_indisponivel" };
  const escopo = { perfilId: sessao.perfilId, sessaoId: sessao.sessaoId };
  const aceito: Resultado = { ok: true, comandoId, tick: ctx.estado.relogio.tick, versoes: {} };
  if (acao.t === "liberar_obra") {
    // Encerrar a própria concessão continua permitido depois de perder decorar.
    if (liberarTrava(registro, escopo, acao.referencia)) tocarChave(ctx, "presenca");
    return aceito;
  }
  if (acao.t === "renovar_obra") {
    const atual = registro.travas.find(
      (trava) =>
        trava.perfilId === sessao.perfilId &&
        trava.sessaoId === sessao.sessaoId &&
        trava.referencia.geracao === acao.referencia.geracao &&
        trava.referencia.numero === acao.referencia.numero,
    );
    if (!atual) return { ok: false, comandoId, motivo: "requisito", detalhe: "trava_perdida" };
    if (!temPermissao(ctx.estado, sessao.perfilId, atual.alvo.familiaId, "decorar")) {
      if (liberarTrava(registro, escopo, acao.referencia)) tocarChave(ctx, "presenca");
      return { ok: false, comandoId, motivo: "sem_permissao" };
    }
  }
  const alvo =
    acao.t === "preparar_obra"
      ? derivarAlvoDaObra(ctx.estado, sessao.perfilId, acao.rascunho)
      : null;
  if (alvo && !alvo.ok)
    return {
      ok: false,
      comandoId,
      motivo: alvo.motivo,
      ...(alvo.detalhe ? { detalhe: alvo.detalhe } : {}),
    };
  const resultado =
    acao.t === "renovar_obra"
      ? renovarTrava(registro, registro.agoraMs, escopo, acao.referencia)
      : alvo?.ok
        ? adquirirTrava(registro, registro.agoraMs, escopo, alvo.alvo)
        : null;
  if (!resultado) throw new Error("Alvo de obra não conferido");
  if (resultado.mudou) tocarChave(ctx, "presenca");
  if (!resultado.ok)
    return {
      ok: false,
      comandoId,
      motivo: resultado.motivo === "ocupado" ? "ocupado" : "requisito",
      detalhe: resultado.motivo === "ocupado" ? "trava_ocupada" : resultado.motivo,
    };
  return {
    ...aceito,
    obra: {
      referencia: resultado.concessao.referencia,
      alvo: resultado.concessao.alvo,
      prazoMs: resultado.concessao.ateMs - registro.agoraMs,
    },
  };
}

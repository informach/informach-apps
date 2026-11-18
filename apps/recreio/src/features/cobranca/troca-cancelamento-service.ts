import "server-only";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { AppError, assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { comCicloDeCobranca } from "./lifecycle";
import {
  admitirCancelamentoDaTrocaLocked,
  conferirResultadoDaTrocaNoBanco,
} from "./troca-execucao-repository";
import type { RuntimeDeEnvioDaTroca } from "./troca-execucao-runtime";
import { recuperarAgendaAdmitida } from "./troca-recuperacao-service";

export function criarCancelamentoDeReducao(obterRuntime: () => RuntimeDeEnvioDaTroca) {
  return async (autor: AutorNativoRecente, entrada: unknown) => {
    const id = z.uuid().parse(entrada);
    await limitarTentativas({
      chave: `troca-cancelar:${autor.contaId}`,
      max: 10,
      janelaEmSegundos: 600,
    });
    return comCicloDeCobranca(autor.contaId, async () => {
      const runtime = obterRuntime();
      assertAllowed(
        runtime.modo === "dev",
        "INDISPONIVEL",
        "Gestão comercial disponível somente no ambiente de teste.",
      );
      const prova = await admitirCancelamentoDaTrocaLocked(autor, id, runtime.modo);
      const resultado = prova
        ? await recuperarAgendaAdmitida(prova, runtime.agendas, { deadlineMs: Date.now() + 90_000 })
        : null;
      const recibo = await conferirResultadoDaTrocaNoBanco(autor, id, runtime.modo);
      if (resultado?.falhou)
        throw new AppError(
          "COBRANCA_EM_CONFERENCIA",
          "O cancelamento ainda precisa de confirmação. Confira o pedido antes de tentar novamente.",
        );
      return recibo;
    });
  };
}

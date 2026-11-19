import "server-only";
import { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { env } from "@/lib/env";
import { AppError, assertAllowed } from "@/lib/errors";
import { limitarTentativas } from "@/lib/rate-limit";
import { comCicloDeCobranca } from "./lifecycle";
import {
  admitirTentativaDaTrocaLocked,
  conferirResultadoDaTrocaNoBanco,
  conferirTrocaParaEnvioLocked,
} from "./troca-execucao-repository";
import type { RuntimeDeEnvioDaTroca } from "./troca-execucao-runtime";
import { recuperarAgendaAdmitida } from "./troca-recuperacao-service";

function criarOperacao(obterRuntime: () => RuntimeDeEnvioDaTroca, somenteRecuperacao: boolean) {
  return async (autor: AutorNativoRecente, entrada: unknown) => {
    const id = z.uuid().parse(entrada);
    assertAllowed(
      somenteRecuperacao || env.RECREIO_BILLING_MODE === "sandbox",
      "INDISPONIVEL",
      "As trocas ainda estão em homologação.",
    );
    await limitarTentativas({
      chave: `troca-enviar:${autor.contaId}`,
      max: 10,
      janelaEmSegundos: 600,
    });
    return comCicloDeCobranca(autor.contaId, async () => {
      const runtime = obterRuntime();
      assertAllowed(
        runtime.modo === "dev",
        "INDISPONIVEL",
        "Envio disponível somente no ambiente de teste.",
      );
      const { jaAdmitida } = await conferirTrocaParaEnvioLocked(autor, id, runtime.modo);
      assertAllowed(
        !somenteRecuperacao || jaAdmitida,
        "OPERACAO_EM_CONFERENCIA",
        "A troca ainda não foi enviada.",
      );
      const budget = { deadlineMs: Date.now() + 90_000 };
      if (!jaAdmitida) await runtime.conferirCatalogo(budget);
      const prova = await admitirTentativaDaTrocaLocked(
        autor,
        id,
        runtime.modo,
        runtime.produtos,
        somenteRecuperacao,
      );
      const { falhou } = await recuperarAgendaAdmitida(prova, runtime.agendas, budget);
      const resultado = await conferirResultadoDaTrocaNoBanco(autor, id, runtime.modo);
      if (falhou)
        throw new AppError(
          "COBRANCA_EM_CONFERENCIA",
          "Não foi possível confirmar a troca. Confira o pedido antes de tentar novamente.",
        );
      return resultado;
    });
  };
}

export function criarEnvioDeReducao(obterRuntime: () => RuntimeDeEnvioDaTroca) {
  return criarOperacao(obterRuntime, false);
}

/** Existing attempts survive sales/catalog shutdown; never admits a new one. */
export function criarRecuperacaoDeReducao(obterRuntime: () => RuntimeDeEnvioDaTroca) {
  return criarOperacao(obterRuntime, true);
}

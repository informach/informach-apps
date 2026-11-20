import "server-only";
import type { PlanoDeDireitos } from "../preparacao-contrato";
import type { criarArmazenamentoDoLivro } from "./armazenamento";
import { FalhaDoLivroDeDireitos, type IntencaoDeDireitos } from "./contrato";
import { reaplicarLivroCongelado } from "./leitura";

import { conferirEscopoDoPlanoExterno } from "./plano-externo";

/** Preflight completo dos planos antes do primeiro efeito do consumidor.
 * Memória de um plano por vez; destino permanece isolado. A cerca assinada é
 * a mesma nas duas passagens. Não reconstrói conta/autoridade por suposição e
 * não declara uma aplicação nativa que o callback não tenha comprovado. */
export async function reaplicarPlanosConsentidos(config: {
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
  maxEntradas: number;
  maxBytesPlanos: number;
  tempoLimiteMs: number;
  cercaSha256?: string;
  signal?: AbortSignal;
  aplicar: (
    intencao: IntencaoDeDireitos,
    plano: PlanoDeDireitos,
    contexto: { sequencia: number; sha256: string; signal: AbortSignal },
  ) => Promise<void>;
}) {
  if (
    !Number.isSafeInteger(config.maxBytesPlanos) ||
    config.maxBytesPlanos < 1 ||
    config.maxBytesPlanos > 256 * 1024 * 1024 ||
    !Number.isSafeInteger(config.tempoLimiteMs) ||
    config.tempoLimiteMs < 1 ||
    config.tempoLimiteMs > 900_000
  )
    throw new FalhaDoLivroDeDireitos("CONFIGURACAO");
  const prazo = AbortSignal.timeout(config.tempoLimiteMs),
    signal = config.signal ? AbortSignal.any([config.signal, prazo]) : prazo;
  let bytesConferidos = 0;
  const verificado = await reaplicarLivroCongelado({
    storage: config.storage,
    maxEntradas: config.maxEntradas,
    tempoLimiteMs: config.tempoLimiteMs,
    signal,
    cercaSha256: config.cercaSha256,
    aplicar: async (i, c) => {
      const plano = await config.storage.lerPlano(i.planoSha256, c.signal);
      conferirEscopoDoPlanoExterno(i, plano);
      bytesConferidos += Buffer.byteLength(JSON.stringify(plano));
      if (!Number.isSafeInteger(bytesConferidos) || bytesConferidos > config.maxBytesPlanos)
        throw new FalhaDoLivroDeDireitos("LIMITE");
    },
  });
  const aplicado = await reaplicarLivroCongelado({
    storage: config.storage,
    maxEntradas: config.maxEntradas,
    tempoLimiteMs: config.tempoLimiteMs,
    signal,
    cercaSha256: verificado.cabecalhoSha256,
    aplicar: async (i, c) => {
      const plano = await config.storage.lerPlano(i.planoSha256, c.signal);
      conferirEscopoDoPlanoExterno(i, plano);
      await config.aplicar(i, plano, c);
    },
  });
  return { ...aplicado, planosConferidos: verificado.entradasReaplicadas, bytesConferidos };
}

import { ErroDoRecreio } from "../dominio/erros";

export const TEMPO_LIMITE_DO_PEDIDO_MS = 10_000;

/** Limita cabeçalhos e corpo; o adapter recebe cancelamento, sem repetição. */
export async function comPrazoDePedido<T>(
  executar: (signal: AbortSignal) => Promise<T>,
  tempoLimiteMs = TEMPO_LIMITE_DO_PEDIDO_MS,
): Promise<T> {
  if (!Number.isSafeInteger(tempoLimiteMs) || tempoLimiteMs <= 0 || tempoLimiteMs > 60_000)
    throw new Error("O prazo do pedido precisa ser um inteiro entre 1 e 60000 ms.");
  const controlador = new AbortController();
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const vencimento = new Promise<never>((_resolve, reject) => {
    temporizador = setTimeout(() => {
      reject(new ErroDoRecreio("INDISPONIVEL"));
      controlador.abort();
    }, tempoLimiteMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => executar(controlador.signal)),
      vencimento,
    ]);
  } finally {
    clearTimeout(temporizador);
    controlador.abort();
  }
}

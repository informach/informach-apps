let active = false;

/** Shared ownership for computational tasks. Cancellation terminates the
 * worker; the resource deadline includes startup and never applies changes. */
export function runBoundedWorkerTask<T>(
  createWorker: () => Worker,
  request: unknown,
  read: (message: unknown) => { done: false } | { done: true; value: T },
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException("Operação cancelada.", "AbortError"));
  if (active)
    return Promise.reject(
      new Error("Há um cálculo de documento em andamento. Aguarde ou cancele-o."),
    );
  active = true;
  let worker: Worker;
  try {
    worker = createWorker();
  } catch (error) {
    active = false;
    return Promise.reject(error);
  }
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const cleanup = () => {
      finished = true;
      active = false;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const fail = (error: unknown) => {
      if (finished) return;
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException("Operação cancelada.", "AbortError"));
    const deadline = setTimeout(
      () =>
        fail(new Error("Cálculo excedeu o limite de 10 segundos; nenhuma alteração foi aplicada.")),
      10000,
    );
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (finished) return;
      try {
        const message = read(event.data);
        if (message.done) {
          cleanup();
          resolve(message.value);
        }
      } catch (error) {
        fail(error);
      }
    };
    worker.onerror = () =>
      fail(new Error("Falha no cálculo isolado; nenhuma alteração foi aplicada."));
    worker.onmessageerror = () => fail(new Error("Resposta inválida do cálculo isolado."));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage(request);
    } catch (error) {
      fail(error);
    }
  });
}

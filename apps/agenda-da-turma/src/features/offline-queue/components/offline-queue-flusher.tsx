"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { flushPendingWrites } from "../client";
import { useQueueOwner } from "../owner";

/**
 * Quem faz a fila subir.
 *
 * Sem UI: mora no shell e escuta os momentos em que vale a pena tentar — a
 * montagem (o app abriu, talvez depois de horas fechado), o evento `online`, a
 * aba voltar a ficar visível, e o recado do service worker. `navigator.onLine`
 * é otimista demais para ser o único gatilho: com portal cativo ou sinal fraco
 * ele nunca chega a virar `false`, e a fila esperaria um `online` que não vem.
 * Os gatilhos se sobrepõem de propósito; a trava em `flushPendingWrites`
 * garante um esvaziamento de cada vez.
 *
 * O recado do worker exige `startMessages()`. A fila de mensagens de um
 * `ServiceWorkerContainer` nasce **desabilitada** e só liga ao atribuir
 * `onmessage` ou ao chamar `startMessages()` — só `addEventListener` deixa o
 * `postMessage` do `sync` enfileirado para sempre, e o gatilho seria letra
 * morta.
 *
 * **O `router.refresh()` acontece aqui, uma vez.** Cada card saber sozinho que
 * subiu já bastava para tirar o selo; se cada um também buscasse de novo, vinte
 * gravações que sobem juntas virariam vinte buscas idênticas da mesma árvore.
 */
export function OfflineQueueFlusher() {
  const router = useRouter();
  const owner = useQueueOwner();

  useEffect(() => {
    if (!owner) return;
    let alive = true;
    const flush = () => {
      if (!alive) return;
      void flushPendingWrites(owner).then((result) => {
        if (alive && result.sent > 0) router.refresh();
      });
    };
    flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: unknown } | null)?.type === "agenda-flush") flush();
    };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    navigator.serviceWorker?.startMessages();
    return () => {
      alive = false;
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [owner, router]);

  return null;
}

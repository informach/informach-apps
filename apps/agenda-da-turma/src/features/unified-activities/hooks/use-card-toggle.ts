"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { isQueued } from "@/features/offline-queue/client";
import { useQueueOwner } from "@/features/offline-queue/owner";
import { visibleForOwner } from "@/features/offline-queue/queue";
import { listPendingWrites, QUEUE_CHANGED_EVENT } from "@/features/offline-queue/store";
import { catchActionResult } from "@/lib/action-result";

type Status = "pending" | "done";

type ToggleResult = { ok: true; value: unknown } | { ok: false; error: { code: string } };

type Args = {
  initialStatus: Status;
  /**
   * A atividade, para o card reencontrar a própria gravação na fila.
   *
   * Sem isto, fechar e reabrir o app ainda sem rede devolvia um card pendente
   * e sem selo: o estado da fila vive no aparelho, e o componente nasce sem
   * memória. Quem não passa `taskId` simplesmente não hidrata.
   */
  taskId?: string;
  optimisticHideWhenDone: boolean;
  toggleAction: (next: Status) => Promise<ToggleResult>;
  onSuccess?: (previousStatus: Status, nextStatus: Status) => void;
  onError?: (error: { code: string }) => void;
  /** Tem que casar com a duration da transition do wrapper visual. */
  exitMs?: number;
};

/**
 * Centraliza o pattern de toggle otimista usado por ActivityCard e
 * UnifiedExtraActivityCard:
 *
 * - aplica `optimisticStatus` imediato pra feedback visual,
 * - dispara `isExiting` quando o card vai sair do bucket
 *   (`optimisticHideWhenDone`) — o caller usa essa flag pra anim CSS,
 * - chama a gravação e o exit timer EM PARALELO (`Promise.all`),
 * - **enfileirado não é gravado**: quando `toggleAction` devolve a marca
 *   `queued` (a rota não respondeu e a gravação ficou no aparelho), o card
 *   mantém a decisão, ganha o selo "sobe quando a rede voltar", NÃO sai da
 *   lista e NÃO chama `router.refresh()` — o servidor não tem nada de novo, e
 *   buscar de novo traria a versão antiga por cima da decisão da pessoa,
 * - quando ambos terminam: marca `optimisticallyHidden = true` (se for
 *   o caso), notifica o parent e chama `router.refresh()` pra sincronizar
 *   o RSC do parent (KPIs do dashboard, ordenação da lista de atividades),
 * - reverte tudo se a action falhar e delega o toast pro caller via
 *   `onError`.
 *
 * Hook é agnóstico de UX (sem strings de toast); cada card decide as
 * mensagens com base nos códigos de erro específicos da sua action.
 *
 * ⚠️ **Há uma SEGUNDA implementação deste fluxo** em
 * `features/kid-mode/components/kid-mode-screen.tsx`. Ela existe porque este
 * hook chama `router.refresh()` a cada sucesso, e no modo criança isso
 * reordenaria a lista embaixo de uma criança no meio da sessão. Ao consertar
 * algo aqui — rollback, conflito de versão, condição de corrida — **olhe lá
 * também**: o conserto do conflito de versão já precisou ser feito duas vezes.
 */
export function useCardToggle({
  initialStatus,
  taskId,
  optimisticHideWhenDone,
  toggleAction,
  onSuccess,
  onError,
  exitMs = 280,
}: Args) {
  const router = useRouter();
  const queueOwner = useQueueOwner();
  const [optimisticStatus, setOptimisticStatus] = useState<Status>(initialStatus);
  const [isExiting, setIsExiting] = useState(false);
  const [optimisticallyHidden, setOptimisticallyHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  /**
   * O que a pessoa tentou quando deu errado.
   *
   * Sem isto, falhar era um beco: o card revertia, o erro aparecia, e a única
   * saída era tocar o botão de novo — o que é fácil num card, mas invisível como
   * opção. No portão da escola, com sinal indo e voltando, a pessoa precisa de
   * um alvo que diga "dá para insistir" em vez de adivinhar.
   */
  const [failedAttempt, setFailedAttempt] = useState<Status | null>(null);
  /**
   * A gravação ficou na fila do aparelho em vez de subir.
   *
   * O card continua mostrando a decisão da pessoa — ela decidiu —, mas passa a
   * dizer que aquilo ainda não chegou ao servidor. E não sai da lista: sumir
   * seria prometer que subiu, e ao recarregar a atividade voltaria pendente sem
   * explicação nenhuma.
   */
  const [queuedKey, setQueuedKey] = useState<string | null>(null);
  // O `onError` do caller é recriado a cada render; guardá-lo numa ref impede
  // que a assinatura do evento da fila seja refeita a cada renderização.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  // Sync quando o server retorna nova versão do item (refresh()/router push).
  // Reset cobre o caso em que o card "voltou" antes do timer de exit terminar.
  useEffect(() => {
    setOptimisticStatus(initialStatus);
    setIsExiting(false);
    setOptimisticallyHidden(false);
    setFailedAttempt(null);
    setQueuedKey(null);
  }, [initialStatus]);

  /**
   * O card e a fila, nos dois sentidos.
   *
   * **Hidrata** na montagem: a decisão vive no aparelho, e o componente nasce
   * sem memória dela. Fechar e reabrir o app ainda sem rede devolvia um card
   * pendente, sem selo — desfazendo na tela o que a pessoa tinha decidido.
   *
   * **Limpa** quando a gravação resolve, e as duas saídas são diferentes: se a
   * entrada SUMIU, ela subiu, e o selo sai calado (quem busca a versão nova é o
   * `OfflineQueueFlusher`, uma vez para a árvore inteira, em vez de uma vez por
   * card). Se ela continua lá como conflito, o servidor recusou: o card volta
   * ao que o servidor diz, mostra o motivo e vira de novo um alvo para insistir.
   */
  const queuedKeyRef = useRef<string | null>(null);
  queuedKeyRef.current = queuedKey;
  useEffect(() => {
    if (!taskId || !queueOwner) return;
    let alive = true;
    const check = () => {
      void listPendingWrites().then((all) => {
        if (!alive) return;
        const mine = visibleForOwner(all, queueOwner).filter((item) => item.taskId === taskId);
        const waiting = mine.find((item) => item.state === "pending");
        if (waiting) {
          setQueuedKey(waiting.key);
          setOptimisticStatus(waiting.status);
          return;
        }
        const previous = queuedKeyRef.current;
        if (!previous) return;
        setQueuedKey(null);
        const refused = mine.find((item) => item.key === previous);
        if (!refused) return;
        setOptimisticStatus(initialStatus);
        setFailedAttempt(refused.status);
        onErrorRef.current?.({ code: refused.errorCode ?? "VERSION_CONFLICT" });
      });
    };
    check();
    window.addEventListener(QUEUE_CHANGED_EVENT, check);
    return () => {
      alive = false;
      window.removeEventListener(QUEUE_CHANGED_EVENT, check);
    };
  }, [taskId, queueOwner, initialStatus]);

  const handleToggle = (next: boolean) => {
    const previousStatus = optimisticStatus;
    const nextStatus: Status = next ? "done" : "pending";
    setFailedAttempt(null);
    setQueuedKey(null);
    setOptimisticStatus(nextStatus);

    const willExit = optimisticHideWhenDone && nextStatus === "done";
    if (willExit) {
      setIsExiting(true);
    }

    startTransition(async () => {
      // Roda action e exit timer EM PARALELO. Em sucesso, espera ambos pra
      // (a) preservar a animação CSS (sem refresh cortar antes dos exitMs)
      // e (b) sincronizar UI com o server (KPIs, ordenação na lista).
      const exitPromise = willExit
        ? new Promise<void>((resolve) => setTimeout(resolve, exitMs))
        : Promise.resolve();
      const [result] = await Promise.all([
        catchActionResult(() => toggleAction(nextStatus)),
        exitPromise,
      ]);

      if (!result.ok) {
        setOptimisticStatus(previousStatus);
        setIsExiting(false);
        setOptimisticallyHidden(false);
        setFailedAttempt(nextStatus);
        onError?.(result.error);
        router.refresh();
        return;
      }

      // Enfileirado não é gravado. Nada a sincronizar com o servidor — e
      // `router.refresh()` traria de volta a versão antiga por cima da decisão
      // que a pessoa acabou de tomar.
      if (isQueued(result.value)) {
        setIsExiting(false);
        setOptimisticallyHidden(false);
        setQueuedKey(result.value.key);
        onSuccess?.(previousStatus, nextStatus);
        return;
      }
      if (willExit) {
        setOptimisticallyHidden(true);
      }
      onSuccess?.(previousStatus, nextStatus);
      router.refresh();
    });
  };

  return {
    isDone: optimisticStatus === "done",
    isExiting,
    optimisticallyHidden,
    pending,
    queued: queuedKey !== null,
    handleToggle,
    /**
     * Repete a última tentativa que falhou, ou `null` quando não houve falha.
     *
     * Não se confunde com a fila: a fila guarda o que não teve resposta, e este
     * alvo existe para quando a resposta veio e foi uma recusa — conflito de
     * versão, limite do plano. O `router.refresh()` da falha já trouxe a versão
     * nova, então a segunda tentativa não repete o mesmo conflito.
     */
    retry: failedAttempt === null ? null : () => handleToggle(failedAttempt === "done"),
  };
}

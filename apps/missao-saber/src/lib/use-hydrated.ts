"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * `false` no HTML do servidor e até a hidratação, `true` depois. O HTML chega
 * antes dos listeners, e numa conexão móvel um toque nesse intervalo se perde
 * sem aviso. Controles que só funcionam com JS ficam desabilitados até aqui,
 * e o clique de quem tocou cedo demais espera em vez de sumir.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, onClient, onServer);
}

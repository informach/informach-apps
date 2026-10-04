"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * `false` no HTML do servidor e até a hidratação, `true` depois.
 *
 * O HTML chega antes dos listeners. Um botão que só age pelo `onClick` aparece
 * pronto e ignora o toque nesse intervalo, sem aviso. Numa rede móvel o
 * intervalo dura segundos, e foi assim que a Agenda perdia a conclusão feita
 * logo ao abrir a lista e o Missão Saber perdia o "Começar missão".
 *
 * Controle que só funciona com JS fica `disabled={!hydrated || …}`: quem toca
 * cedo vê que ainda não está pronto, e o `click()` do Playwright espera em vez
 * de cair no vazio.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, onClient, onServer);
}

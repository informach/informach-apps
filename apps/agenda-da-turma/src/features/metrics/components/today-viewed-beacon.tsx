"use client";

import { useEffect } from "react";
import { catchActionResult } from "@/lib/action-result";
import { recordTodayViewedAction } from "../today-viewed";

// Por adulto: dois adultos no mesmo aparelho são duas aberturas no dia.
const storageKey = (userId: string) => `agenda:today-viewed:${userId}`;

/**
 * Avisa uma vez por dia que Hoje foi aberto. Sem interface.
 *
 * O dia vem do servidor (São Paulo), não do relógio do aparelho, para que a
 * conta feche com a do banco. Se o armazenamento do navegador falhar (aba
 * anônima, dados bloqueados), manda mesmo assim: o servidor também confere.
 */
export function TodayViewedBeacon({ todayIso, userId }: { todayIso: string; userId: string }) {
  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(storageKey(userId));
    } catch {
      seen = null;
    }
    if (seen === todayIso) return;
    void catchActionResult(() => recordTodayViewedAction({})).then((result) => {
      if (!result.ok) return;
      try {
        window.localStorage.setItem(storageKey(userId), todayIso);
      } catch {
        // Sem armazenamento, o servidor segue deduplicando.
      }
    });
  }, [todayIso, userId]);
  return null;
}

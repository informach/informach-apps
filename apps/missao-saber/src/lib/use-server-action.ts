"use client";
import { useCallback, useState } from "react";

/**
 * Estado de "salvando" para chamadas de server action a partir de um
 * componente cliente. Tem a mesma forma de `useTransition`, de propósito, para
 * a troca ser um import.
 *
 * Não usa `useTransition` porque, no Next 16, uma action que revalida a árvore
 * (`revalidatePath`) dentro de `startTransition` pode deixar o `isPending`
 * preso em `true` para sempre: a árvore nova chega, mas o commit não acontece
 * (vercel/next.js#86055). A jornada, que é longa, reproduzia isso em produção.
 * Aqui o pending é um estado comum, ligado antes da chamada e desligado no
 * `finally`, e a revalidação feita pela action atualiza a página sozinha.
 */
export function useServerAction() {
  const [pending, setPending] = useState(false);
  const start = useCallback(async (task: () => Promise<void>) => {
    setPending(true);
    try {
      await task();
    } finally {
      setPending(false);
    }
  }, []);
  return [pending, start] as const;
}

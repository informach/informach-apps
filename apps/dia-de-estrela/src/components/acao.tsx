"use client";
import { useCallback, useState } from "react";
import { useServerAction } from "@/lib/use-server-action";

type Resultado<T> = { ok: true; data: T } | { ok: false; error: string; code: string };

/**
 * Chama uma server action e guarda a mensagem de erro para mostrar perto do
 * botão. A action revalida a página; aqui só cuidamos de "salvando…" e do erro.
 */
export function useAcao() {
  const [pendente, iniciar] = useServerAction();
  const [erro, setErro] = useState<string | null>(null);
  const rodar = useCallback(
    <T,>(acao: () => Promise<Resultado<T>>, aoConcluir?: (dados: T) => void) =>
      iniciar(async () => {
        setErro(null);
        const r = await acao();
        if (!r.ok) {
          setErro(r.error);
          return;
        }
        aoConcluir?.(r.data);
      }),
    [iniciar],
  );
  return { pendente, erro, setErro, rodar };
}

export function Erro({ texto }: { texto: string | null }) {
  return (
    <p role="status" aria-live="polite" className="min-h-5 text-sm font-bold text-[#8f1d14]">
      {texto}
    </p>
  );
}

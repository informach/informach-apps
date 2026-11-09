"use client";
import { Tablet } from "lucide-react";
import { useEffect, useState } from "react";
import { fecharAreaDosPaisAction } from "@/features/crianca/actions";

/**
 * Faixa da área dos pais aberta pelo PIN no aparelho da criança: mostra
 * quanto falta para fechar sozinha e leva de volta para a tela da criança.
 */
export function VoltarParaCrianca({ ate }: { ate: number }) {
  const [restam, setRestam] = useState(() => Math.max(0, ate - Date.now()));
  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, ate - Date.now());
      setRestam(r);
      if (r === 0) {
        clearInterval(id);
        void fecharAreaDosPaisAction().then(() => window.location.assign("/crianca"));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [ate]);
  const min = Math.ceil(restam / 60_000);
  return (
    <button
      type="button"
      onClick={() => void fecharAreaDosPaisAction().then(() => window.location.assign("/crianca"))}
      className="sticky top-0 z-40 flex min-h-12 w-full items-center justify-center gap-2 bg-tinta px-4 text-sm font-extrabold text-white"
    >
      <Tablet className="size-4" aria-hidden="true" />
      Voltar para a tela da criança
      <span className="font-semibold opacity-80">· fecha em {min} min</span>
    </button>
  );
}

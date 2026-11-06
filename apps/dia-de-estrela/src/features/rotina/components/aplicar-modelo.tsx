"use client";
import { useState } from "react";
import { Erro, useAcao } from "@/components/acao";
import { aplicarModeloAction } from "../actions";

/** Chip de modelo pronto com confirmação no próprio lugar (sem diálogo do navegador). */
export function AplicarModelo({
  childId,
  childName,
  templateId,
  nome,
  quantas,
}: {
  childId: string;
  childName: string;
  templateId: string;
  nome: string;
  quantas: number;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const { pendente, erro, rodar } = useAcao();
  if (!confirmando)
    return (
      <button type="button" className="bp bp-claro" onClick={() => setConfirmando(true)}>
        {nome}
      </button>
    );
  return (
    <div className="cartao flex w-full flex-wrap items-center gap-2 p-3">
      <p className="flex-1 text-sm font-bold">
        Adicionar as {quantas} tarefas de “{nome}” para {childName}?
      </p>
      <button type="button" className="bp bp-claro" onClick={() => setConfirmando(false)}>
        Não
      </button>
      <button
        type="button"
        className="bp bp-ceu"
        disabled={pendente}
        onClick={() =>
          rodar(
            () => aplicarModeloAction({ childId, templateId }),
            () => setConfirmando(false),
          )
        }
      >
        Adicionar
      </button>
      <Erro texto={erro} />
    </div>
  );
}

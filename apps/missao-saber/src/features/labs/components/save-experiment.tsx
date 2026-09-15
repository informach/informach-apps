"use client";
import { useState, useTransition } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { experimentAction } from "../actions";
import type { ExperimentInput } from "../schemas";

export function SaveExperiment({
  profileId,
  state,
  initialRevision = 0,
}: {
  profileId?: string;
  state: ExperimentInput;
  initialRevision?: number;
}) {
  const [revision, setRevision] = useState(initialRevision);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  if (!profileId) return null;
  return (
    <div className="mt-5 border-t-2 border-sombra pt-4">
      <BotaoChapa
        type="button"
        tom="contorno"
        medida="p"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const result = await experimentAction({ profileId, state, revision });
              if (result.ok) {
                setRevision(result.data);
                setMessage(
                  "Experimento salvo na sua conta. Depois de mudar algo, salve novamente.",
                );
              } else setMessage(result.error);
            } catch {
              setMessage(
                "Não foi possível confirmar o salvamento. Tente novamente; sua montagem continua aqui.",
              );
            }
          })
        }
      >
        {pending ? "Salvando…" : "Salvar experimento para continuar depois"}
      </BotaoChapa>
      <p role="status" className="mt-2 text-xs text-tinta-suave">
        {message || "Salvamento manual: salve antes de sair para o caderno ou fechar a página."}
      </p>
    </div>
  );
}

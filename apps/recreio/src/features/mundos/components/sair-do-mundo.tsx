"use client";
import { useId, useRef, useState, useTransition } from "react";
import { sairDoMundoAction } from "../actions";

export function SairDoMundo({ mundoId }: { mundoId: string }) {
  const consequenciasId = useId();
  const detalhes = useRef<HTMLDetailsElement>(null);
  const [pendente, iniciar] = useTransition();
  const [erro, definirErro] = useState("");
  return (
    <details ref={detalhes} className="mt-4">
      <summary className="rb rb-vazado w-fit cursor-pointer list-none">
        Quero sair deste mundo
      </summary>
      <p id={consequenciasId} className="mt-4 text-tinta-suave">
        Você perde o acesso a este mundo. Os personagens e o progresso ficam para quem continua.
        Para voltar, você precisará aceitar outro convite.
      </p>
      <fieldset disabled={pendente} className="mt-4 flex flex-wrap gap-3">
        <legend className="sr-only">Confirmar saída deste mundo</legend>
        <button
          type="button"
          className="rb rb-vazado"
          onClick={() => {
            definirErro("");
            if (detalhes.current) {
              detalhes.current.open = false;
              detalhes.current.querySelector("summary")?.focus();
            }
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="rb rb-sol"
          aria-describedby={consequenciasId}
          onClick={() =>
            iniciar(async () => {
              definirErro("");
              try {
                const resultado = await sairDoMundoAction(mundoId);
                if (resultado.ok) window.location.assign(resultado.data.destination);
                else definirErro(resultado.error);
              } catch {
                definirErro(
                  "Não foi possível confirmar a saída. Confira sua conexão e tente novamente.",
                );
              }
            })
          }
        >
          {pendente ? "Saindo…" : "Confirmar saída"}
        </button>
      </fieldset>
      <p role="status" className="mt-2 text-sm font-semibold text-coral">
        {erro}
      </p>
    </details>
  );
}

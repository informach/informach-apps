"use client";
import { useState, useTransition } from "react";
import { desconectarAparelhoAction } from "../actions";

export function DesconectarAparelho({ id, iniciadoEm }: { id: string; iniciadoEm: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, definirErro] = useState("");
  return (
    <div>
      <button
        type="button"
        className="rb rb-vazado"
        disabled={pendente}
        aria-label={`Desconectar aparelho iniciado em ${iniciadoEm}`}
        onClick={() =>
          iniciar(async () => {
            definirErro("");
            const resultado = await desconectarAparelhoAction(id);
            if (resultado.ok) window.location.reload();
            else definirErro(resultado.error);
          })
        }
      >
        {pendente ? "Desconectando…" : "Desconectar"}
      </button>
      <p role="status" className="mt-2 text-sm font-semibold text-coral">
        {erro}
      </p>
    </div>
  );
}

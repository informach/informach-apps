"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useState, useTransition } from "react";
import {
  desconectarPareadoAction,
  sairDoCompartilhadoAction,
  sairDoPareadoAction,
} from "../actions";

export function SairDoAparelho({ tipo = "pareado" }: { tipo?: "pareado" | "compartilhado" }) {
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const interativo = useHydrated();
  return (
    <div>
      <button
        type="button"
        disabled={!interativo || pendente}
        className="rb rb-vazado"
        onClick={() =>
          iniciar(async () => {
            try {
              const resultado =
                tipo === "pareado"
                  ? await sairDoPareadoAction()
                  : await sairDoCompartilhadoAction();
              if (resultado.ok) window.location.replace(resultado.data.destination);
              else setErro(resultado.error);
            } catch {
              setErro("Não foi possível sair agora. Tente novamente.");
            }
          })
        }
      >
        {pendente ? "Saindo…" : "Sair deste aparelho"}
      </button>
      <p role="status" className="mt-2 text-sm font-semibold text-coral">
        {erro}
      </p>
    </div>
  );
}

export function DesconectarAparelhoDoMenor({
  perfilId,
  aparelhoId,
}: {
  perfilId: string;
  aparelhoId: string;
}) {
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const interativo = useHydrated();
  return (
    <div>
      <button
        type="button"
        disabled={!interativo || pendente}
        className="rb rb-vazado"
        onClick={() =>
          iniciar(async () => {
            try {
              const resultado = await desconectarPareadoAction({ perfilId, aparelhoId });
              if (resultado.ok) window.location.reload();
              else setErro(resultado.error);
            } catch {
              setErro("Não foi possível desconectar. Tente novamente.");
            }
          })
        }
      >
        {pendente ? "Desconectando…" : "Desconectar aparelho"}
      </button>
      <p role="status" className="mt-2 text-sm font-semibold text-coral">
        {erro}
      </p>
    </div>
  );
}

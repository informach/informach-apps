"use client";
import { useState, useTransition } from "react";
import { criarConviteAction } from "../actions";

const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Gera um código de convite e o mostra uma vez. O Recreio não guarda o código:
 * saindo desta tela, só gerando outro.
 */
export function GerarConvite({ mundoId }: { mundoId: string }) {
  const [convite, setConvite] = useState<{ codigo: string; expiraEm: string } | null>(null);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function gerar() {
    setErro("");
    iniciar(async () => {
      const resultado = await criarConviteAction(mundoId);
      if (resultado.ok) setConvite(resultado.data);
      else setErro(resultado.error);
    });
  }

  return (
    <div>
      {convite && (
        <div className="mb-4 rounded-controle border-[1.5px] border-sol bg-painel-2 p-4">
          <p className="text-sm font-semibold text-tinta-suave">Código do convite</p>
          <p className="mt-1 font-display text-3xl font-extrabold tracking-widest select-all">
            {convite.codigo}
          </p>
          <p className="mt-2 text-sm text-tinta-suave">
            Vale uma vez, até {quando.format(new Date(convite.expiraEm))}. Anote ou envie agora: ele
            não aparece de novo.
          </p>
        </div>
      )}
      <button type="button" className="rb rb-vazado" disabled={pendente} onClick={gerar}>
        {pendente ? "Gerando…" : convite ? "Gerar outro código" : "Gerar código de convite"}
      </button>
      <p role="status" className="mt-2 min-h-5 text-sm font-semibold text-coral">
        {erro}
      </p>
    </div>
  );
}

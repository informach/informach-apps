"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useState } from "react";
import { retirarAdultoAction } from "../participacao-actions";
import { ErroDaAcao, useAcaoDoGrupo } from "./acao";

export function RetirarParticipacao({
  grupoId,
  perfil,
}: {
  grupoId: string;
  perfil: { perfilId: string; apelido: string; versao: number };
}) {
  const hidratado = useHydrated();
  const acao = useAcaoDoGrupo();
  const [ciente, definirCiente] = useState(false);
  return (
    <section aria-label={`Participação de ${perfil.apelido}`} className="painel mt-3 p-4">
      <p className="font-bold">{perfil.apelido}</p>
      <fieldset disabled={!hidratado || acao.pendente} className="mt-2">
        <legend className="sr-only">Retirar participação do adulto</legend>
        <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-ceu"
            checked={ciente}
            onChange={(e) => definirCiente(e.target.checked)}
          />
          <span>
            Entendo que retirar encerra as partidas deste adulto e preserva os dados dele.
          </span>
        </label>
        <button
          type="button"
          className="rb rb-vazado mt-2"
          disabled={!ciente}
          onClick={() =>
            acao.executar(() =>
              retirarAdultoAction({ grupoId, perfilId: perfil.perfilId, versao: perfil.versao }),
            )
          }
        >
          Retirar adulto do grupo
        </button>
      </fieldset>
      <ErroDaAcao erro={acao.erro} recente={acao.recente} />
    </section>
  );
}

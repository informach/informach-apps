"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useState } from "react";
import { coberturaPropriaAction, sairDoGrupoAction } from "../participacao-actions";
import type { MinhaParticipacao } from "../participacao-consulta-repository";
import { ErroDaAcao, useAcaoDoGrupo } from "./acao";

export function ParticipacaoPropria({
  participacao: p,
  novasCoberturas,
}: {
  participacao: MinhaParticipacao;
  novasCoberturas: boolean;
}) {
  const hidratado = useHydrated();
  const acao = useAcaoDoGrupo();
  const [ciente, definirCiente] = useState(false);
  return (
    <section aria-labelledby="minha-participacao" className="painel mt-8 p-5 sm:p-6">
      <h2 id="minha-participacao" className="font-display text-2xl font-bold">
        Seu perfil e sua participação
      </h2>
      <p className="mt-3 font-semibold">
        {p.apelido} · {p.efetivo ? "Com cobertura para jogar" : "Sem cobertura para jogar"}
      </p>
      <p className="mt-3 text-sm text-tinta-suave">
        {p.grupoId
          ? p.grupoProprio
            ? "Seu perfil participa do grupo que você administra."
            : "Seu perfil participa do grupo de outro adulto. Isso não lhe dá administração desse grupo."
          : "Seu perfil está guardado e não participa de um grupo neste momento."}
      </p>
      <p className="mt-3 text-sm text-tinta-suave">
        Sair encerra suas partidas, mas preserva seu perfil, progresso e vínculos nos mundos. Uma
        cobrança própria continua ativa. Seus acessos antigos permanecem encerrados ao voltar.
      </p>
      <fieldset disabled={!hidratado || acao.pendente} className="mt-4">
        <legend className="sr-only">Confirmar alteração da participação</legend>
        <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-ceu"
            checked={ciente}
            onChange={(e) => definirCiente(e.target.checked)}
          />
          <span>Entendo os efeitos sobre minhas partidas e minha cobrança.</span>
        </label>
        {p.grupoId && (
          <button
            type="button"
            className="rb rb-vazado mt-3"
            disabled={!ciente}
            onClick={() =>
              acao.executar(() => sairDoGrupoAction({ grupoId: p.grupoId, versao: p.versao }))
            }
          >
            Sair deste grupo
          </button>
        )}
        {(!p.grupoId || (p.grupoProprio && !p.selecionado)) && (
          <div className="mt-4">
            <p className="text-sm text-tinta-suave">
              {p.limiteProprio
                ? `Sua cobertura própria permite ${p.limiteProprio} ${p.limiteProprio === 1 ? "jogador" : "jogadores"}; a vaga será conferida ao confirmar.`
                : "Você ainda não tem uma vaga própria disponível para jogar."}
            </p>
            <button
              type="button"
              className="rb rb-sol mt-3"
              disabled={!ciente || !novasCoberturas || p.limiteProprio === 0}
              onClick={() => acao.executar(() => coberturaPropriaAction({ versao: p.versao }))}
            >
              Usar minha cobertura própria
            </button>
          </div>
        )}
      </fieldset>
      <ErroDaAcao erro={acao.erro} recente={acao.recente} />
    </section>
  );
}

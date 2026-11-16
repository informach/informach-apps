"use client";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action";
import type { painelDaResponsabilidade } from "../responsabilidade";
import {
  proporResponsabilidadeAction,
  responderResponsabilidadeAction,
} from "../responsabilidade-actions";

type Painel = Awaited<ReturnType<typeof painelDaResponsabilidade>>;
const mensagens = {
  pending: "Proposta enviada. A responsabilidade muda somente se a outra pessoa aceitar.",
  accepted:
    "A proposta foi aceita. As partidas dos dois participantes neste mundo foram encerradas para atualizar as permissões. O progresso foi preservado. Os convites de entrada ainda não usados do antigo responsável foram cancelados.",
  declined: "Proposta recusada. A responsabilidade continua com a mesma pessoa.",
  revoked: "Proposta cancelada. A responsabilidade continua com a mesma pessoa.",
  expired: "A proposta venceu. O responsável atual pode preparar outra.",
};

export function Responsabilidade({
  painel,
  prazoDaProposta,
}: {
  painel: Painel;
  prazoDaProposta: string | null;
}) {
  const router = useRouter();
  const campoId = useId();
  const avisoId = useId();
  const [membroId, escolher] = useState("");
  const [mensagem, informar] = useState("");
  const [login, exigirLogin] = useState(false);
  const [pendente, iniciar] = useTransition();
  function executar(operacao: () => Promise<ActionResult<{ estado: keyof typeof mensagens }>>) {
    iniciar(async () => {
      informar("");
      exigirLogin(false);
      try {
        const resultado = await operacao();
        if (!resultado.ok) {
          informar(resultado.error);
          exigirLogin(resultado.code === "LOGIN_RECENTE" || resultado.code === "AUTH");
          return;
        }
        informar(mensagens[resultado.data.estado]);
        escolher("");
        router.refresh();
      } catch {
        informar(
          "Não foi possível conferir a resposta. Confira sua conexão e atualize a página antes de tentar novamente.",
        );
      }
    });
  }
  const proposta = painel.proposta;
  return (
    <section className="painel mt-8 max-w-2xl p-5 sm:p-6" aria-label="Responsabilidade pelo mundo">
      <h2 className="font-display text-2xl font-bold">
        {painel.responsavel ? "Você responde por este mundo" : "Sua participação"}
      </h2>
      {!painel.podeTransferir ? (
        <p className="mt-4 text-tinta-suave">Este mundo não está disponível para transferência.</p>
      ) : proposta ? (
        <>
          <p className="mt-4 text-tinta-suave">
            {proposta.recebida
              ? "Você recebeu uma proposta para assumir a responsabilidade por este mundo."
              : proposta.destinatario
                ? `Você propôs a transferência para ${proposta.destinatario}.`
                : "Há uma proposta de transferência enviada."}
          </p>
          <p className="mt-3 text-sm text-tinta-suave">
            Prazo para responder: {prazoDaProposta} (horário de Brasília).
          </p>
          {!proposta.vigente ? (
            <p className="mt-3">Esta proposta venceu. O responsável pode preparar outra.</p>
          ) : proposta.recebida ? (
            <details className="mt-4">
              <summary className="rb rb-sol w-fit cursor-pointer list-none">
                Avaliar proposta
              </summary>
              <p id={avisoId} className="mt-4 text-tinta-suave">
                Ao aceitar, os convites de entrada ainda não usados do antigo responsável serão
                cancelados. Você passa a responder pelo mundo. O responsável atual continua como
                membro. Os personagens, o progresso e os direitos próprios da família do Morada
                ficam preservados. As partidas dos dois neste mundo serão encerradas para atualizar
                as permissões. A assinatura e a cota de criação de mundos de cada pessoa continuam
                como estão.
              </p>
              <fieldset disabled={pendente} className="mt-4 flex flex-wrap gap-3">
                <legend className="sr-only">Decidir sobre a responsabilidade</legend>
                <button
                  type="button"
                  className="rb rb-vazado"
                  onClick={() =>
                    executar(() =>
                      responderResponsabilidadeAction(painel.mundo.id, proposta.id, "declined"),
                    )
                  }
                >
                  Recusar proposta
                </button>
                <button
                  type="button"
                  className="rb rb-sol"
                  aria-describedby={avisoId}
                  onClick={() =>
                    executar(() =>
                      responderResponsabilidadeAction(painel.mundo.id, proposta.id, "accepted"),
                    )
                  }
                >
                  Aceitar e assumir responsabilidade
                </button>
              </fieldset>
            </details>
          ) : (
            <button
              type="button"
              className="rb rb-vazado mt-4"
              disabled={pendente}
              onClick={() =>
                executar(() =>
                  responderResponsabilidadeAction(painel.mundo.id, proposta.id, "revoked"),
                )
              }
            >
              Cancelar proposta
            </button>
          )}
        </>
      ) : !painel.responsavel ? (
        <p className="mt-4 text-tinta-suave">
          Você não tem uma proposta de responsabilidade pendente neste mundo.
        </p>
      ) : null}
      {painel.responsavel && painel.podeTransferir && !proposta?.vigente ? (
        painel.candidatos.length === 0 ? (
          <p className="mt-4 text-tinta-suave">
            Para transferir a responsabilidade, outro adulto precisa participar deste mundo.
          </p>
        ) : (
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              executar(() => proporResponsabilidadeAction(painel.mundo.id, membroId));
            }}
          >
            <p className="mb-4 text-tinta-suave">
              Escolha outro adulto participante. A proposta vale 24 horas e só muda a
              responsabilidade depois do aceite. Você continua como membro e poderá sair depois.
            </p>
            <fieldset disabled={pendente}>
              <legend className="sr-only">Propor transferência de responsabilidade</legend>
              <label htmlFor={campoId} className="block font-semibold">
                Quem vai receber a proposta?
              </label>
              <select
                id={campoId}
                required
                value={membroId}
                onChange={(event) => escolher(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-controle border border-linha-forte bg-fundo px-3"
              >
                <option value="">Escolha um adulto</option>
                {painel.candidatos.map((membro) => (
                  <option key={membro.id} value={membro.id}>
                    {membro.apelido}
                  </option>
                ))}
              </select>
              <button type="submit" className="rb rb-sol mt-4">
                Propor transferência
              </button>
            </fieldset>
          </form>
        )
      ) : null}
      <p role="status" className="mt-4 text-sm font-semibold">
        {pendente ? "Conferindo a proposta…" : mensagem}
      </p>
      {login ? (
        <a
          className="mt-3 inline-flex font-bold text-ceu underline underline-offset-4"
          href={`/entrar?recente=1&next=${encodeURIComponent(`/conta/mundos/${painel.mundo.id}/responsabilidade`)}`}
        >
          Entrar novamente para confirmar
        </a>
      ) : null}
    </section>
  );
}

"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import type { painelDeMembros } from "../remocao";
import { removerMembroAction } from "../remocao-actions";

type Painel = Awaited<ReturnType<typeof painelDeMembros>>;
const estados = {
  active: "Participação ativa",
  away: "Participação afastada",
  no_access: "Participação sem acesso",
  former: "Participação encerrada",
};

function Participante({
  item,
  pendente,
  confirmar,
}: {
  item: Painel["itens"][number];
  pendente: boolean;
  confirmar: () => void;
}) {
  const avisoId = useId();
  const interativo = useHydrated();
  const detalhes = useRef<HTMLDetailsElement>(null);
  const nome = item.apelido ?? "Participante sem perfil";
  return (
    <li className="painel p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold [overflow-wrap:anywhere]">{nome}</h2>
      <p className="mt-2 text-sm text-tinta-suave">{estados[item.estado]}</p>
      <details ref={detalhes} name="remocao-membro" className="mt-4">
        <summary className="rb rb-vazado w-fit cursor-pointer list-none">
          Remover participação
        </summary>
        <p id={avisoId} className="mt-4 text-tinta-suave">
          {nome} perderá o acesso a este mundo e sua partida nele será encerrada. Os moradores, o
          progresso e a autoria permanecem. Para voltar, a pessoa precisará aceitar um convite
          emitido depois desta remoção. Uma proposta pendente de responsabilidade para ela será
          cancelada. A assinatura não muda.
        </p>
        <fieldset disabled={!interativo || pendente} className="mt-4 flex flex-wrap gap-3">
          <legend className="sr-only">Confirmar remoção de {nome}</legend>
          <button
            type="button"
            className="rb rb-vazado"
            onClick={() => {
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
            aria-describedby={avisoId}
            onClick={confirmar}
          >
            {pendente ? "Confirmando…" : "Confirmar remoção"}
          </button>
        </fieldset>
      </details>
    </li>
  );
}

export function MembrosDoMundo({ painel }: { painel: Painel }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [mensagem, informar] = useState("");
  const [login, exigirLogin] = useState(false);
  function confirmar(membroId: string) {
    iniciar(async () => {
      informar("");
      exigirLogin(false);
      try {
        const r = await removerMembroAction(painel.mundo.id, membroId);
        if (!r.ok) {
          informar(r.error);
          exigirLogin(r.code === "AUTH" || r.code === "LOGIN_RECENTE");
          return;
        }
        informar(
          r.data.removeu
            ? "Participação removida. O mundo e o progresso foram preservados."
            : "Esta participação já estava encerrada.",
        );
        router.refresh();
      } catch {
        informar(
          "Não foi possível conferir a resposta. Atualize a página antes de tentar novamente.",
        );
      }
    });
  }
  return (
    <section className="mt-6 max-w-2xl" aria-label="Gestão de membros">
      <p role="status" className="mb-4 font-semibold [overflow-wrap:anywhere]">
        {mensagem}
      </p>
      {login ? (
        <Link
          href={`/entrar?recente=1&next=${encodeURIComponent(`/conta/mundos/${painel.mundo.id}/membros`)}`}
          className="mb-5 inline-flex font-bold text-ceu underline underline-offset-4"
        >
          Entrar novamente para confirmar
        </Link>
      ) : null}
      {painel.itens.length === 0 ? (
        <p className="painel p-5">Nenhuma outra participação nesta página.</p>
      ) : (
        <ul className="grid gap-4">
          {painel.itens.map((item) => (
            <Participante
              key={item.id}
              item={item}
              pendente={pendente}
              confirmar={() => confirmar(item.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

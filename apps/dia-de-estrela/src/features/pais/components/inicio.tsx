"use client";
import { BellRing, Check, ChevronDown, Clock, Undo2, Volume2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Erro, useAcao } from "@/components/acao";
import { Estrela } from "@/components/desenhos";
import { Icone } from "@/components/icone";
import { estrelasEmReais } from "@/domain/estrelas";
import type { EstadoItem } from "@/domain/rotina";
import {
  adiarAction,
  aprovarAction,
  desfazerAction,
  lembrarAgoraAction,
  marcarPelaCriancaAction,
  resolverPedidoAction,
} from "../actions";

type Alerta = {
  canWrite: boolean;
  id: string;
  childId: string;
  taskId: string;
  childName: string;
  title: string;
  time: string;
  dueCount: number;
  deviceOnline: boolean;
};
type Aprovacao = {
  canWrite: boolean;
  id: string;
  childName: string;
  title: string;
  icon: string;
  stars: number;
};
type Pedido = {
  canWrite: boolean;
  id: string;
  childName: string;
  label: string;
  kind: "money" | "custom";
  stars: number;
};
type Item = {
  taskId: string;
  title: string;
  icon: string;
  time: string;
  estado: EstadoItem;
  completion?: { id: string; status: "approved" | "pending" } | undefined;
};
type Crianca = {
  canWrite: boolean;
  id: string;
  name: string;
  color: string;
  saldo: number;
  temAparelho: boolean;
  itens: Item[];
  foco: { title: string; icon: string } | null;
  focoComecou: boolean;
  feitas: number;
  total: number;
};

export function CartaoAlerta({ a }: { a: Alerta }) {
  const { pendente, erro, rodar } = useAcao();
  const ids = { childId: a.childId, taskId: a.taskId };
  return (
    <section className="rounded-[1.4rem] border-2 border-[#ffd3bf] bg-laranja-clara p-4">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-laranja-escuro text-white">
          <BellRing className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-extrabold">
            {a.childName} ainda não marcou “{a.title}”
          </p>
          <p className="text-sm font-bold text-laranja-escuro">
            Era às {a.time}
            {a.dueCount > 0
              ? ` · o tablet lembrou ${a.dueCount} ${a.dueCount === 1 ? "vez" : "vezes"}`
              : ""}
            {a.deviceOnline ? "" : " · o tablet estava sem sinal"}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          className="bp bp-alerta px-2"
          disabled={pendente || !a.canWrite}
          onClick={() => rodar(() => lembrarAgoraAction(ids))}
        >
          <Volume2 className="size-4" aria-hidden="true" /> Lembrar
        </button>
        <button
          type="button"
          className="bp bp-claro px-2"
          disabled={pendente || !a.canWrite}
          onClick={() => rodar(() => adiarAction(ids))}
        >
          <Clock className="size-4" aria-hidden="true" /> Adiar 15 min
        </button>
        <button
          type="button"
          className="bp bp-claro px-2"
          disabled={pendente || !a.canWrite}
          onClick={() => rodar(() => marcarPelaCriancaAction(ids))}
        >
          <Check className="size-4" aria-hidden="true" /> Já fez
        </button>
      </div>
      <Erro texto={erro} />
    </section>
  );
}

export function EsperandoVoce({
  aprovacoes,
  pedidos,
  starsPerReal,
}: {
  aprovacoes: Aprovacao[];
  pedidos: Pedido[];
  starsPerReal: number;
}) {
  const { pendente, erro, rodar } = useAcao();
  const total = aprovacoes.length + pedidos.length;
  if (!total) return null;
  return (
    <section className="cartao p-4">
      <h2 className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">
        ESPERANDO VOCÊ · {total}
      </h2>
      <ul className="mt-2 divide-y-2 divide-linha">
        {aprovacoes.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ceu-claro text-ceu-escuro">
              <Icone nome={a.icon} className="size-5" />
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-extrabold">
                {a.childName} fez “{a.title}”
              </p>
              <p className="text-sm font-bold text-tinta-suave">
                +{a.stars} estrelas · precisa do seu ok
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
              <button
                type="button"
                className="bp bp-claro"
                disabled={pendente || !a.canWrite}
                onClick={() => rodar(() => desfazerAction(a.id))}
              >
                Não foi feita
              </button>
              <button
                type="button"
                className="bp bp-ceu"
                disabled={pendente || !a.canWrite}
                onClick={() => rodar(() => aprovarAction(a.id))}
              >
                Aprovar
              </button>
            </div>
          </li>
        ))}
        {pedidos.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-estrela-clara text-estrela-texto">
              <Icone nome={p.kind === "money" ? "banknote" : "gift"} className="size-5" />
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-extrabold">
                {p.childName} pediu {p.label}
              </p>
              <p className="text-sm font-bold text-tinta-suave">
                {p.stars} estrelas
                {p.kind === "money" ? "" : ` · vale ${estrelasEmReais(p.stars, starsPerReal)}`}
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
              <button
                type="button"
                className="bp bp-claro"
                disabled={pendente || !p.canWrite}
                onClick={() => rodar(() => resolverPedidoAction({ id: p.id, outcome: "declined" }))}
              >
                Recusar
              </button>
              <button
                type="button"
                className="bp bp-tinta"
                disabled={pendente || !p.canWrite}
                onClick={() =>
                  rodar(() => resolverPedidoAction({ id: p.id, outcome: "delivered" }))
                }
              >
                {p.kind === "money" ? "Já paguei" : "Já entreguei"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Erro texto={erro} />
    </section>
  );
}

const corDoPonto: Record<EstadoItem, string> = {
  feita: "bg-folha",
  agora: "bg-ceu ring-4 ring-ceu-borda",
  atrasada: "bg-laranja",
  "por-vir": "bg-linha-forte",
};

export function CartaoCrianca({ c }: { c: Crianca }) {
  const [aberto, setAberto] = useState(false);
  const { pendente, erro, rodar } = useAcao();
  return (
    <section className="cartao p-4">
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
      >
        <span
          className="grid size-11 shrink-0 place-items-center rounded-full font-display text-xl font-extrabold text-white"
          style={{ background: c.color }}
        >
          {c.name.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">{c.name}</span>
          <span className="block text-sm font-bold text-tinta-suave">
            {c.temAparelho ? "com aparelho conectado" : "sem aparelho conectado"}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-estrela-clara px-3 py-1 text-sm font-extrabold text-estrela-texto">
          <Estrela tamanho={16} /> {c.saldo}
        </span>
        <ChevronDown
          className={`size-5 text-tinta-suave transition-transform ${aberto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <ol
        className="mt-3 flex flex-wrap items-center gap-1"
        aria-label={`${c.feitas} de ${c.total} tarefas`}
      >
        {c.itens.map((i) => (
          <li key={i.taskId} className={`size-3.5 rounded-full ${corDoPonto[i.estado]}`} />
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5 font-bold text-tinta-suave">
          {c.foco ? (
            <>
              <Icone nome={c.foco.icon} className="size-4 shrink-0" />
              <span className="truncate">
                {c.focoComecou ? "Agora" : "Próxima"}: {c.foco.title}
              </span>
            </>
          ) : c.total ? (
            "Tudo feito hoje!"
          ) : (
            "Sem tarefas hoje"
          )}
        </span>
        <strong>
          {c.feitas} de {c.total}
        </strong>
      </div>
      {aberto && (
        <ul className="mt-3 divide-y-2 divide-linha border-t-2 border-linha">
          {c.itens.map((i) => (
            <li key={i.taskId} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-12 font-bold text-tinta-suave">{i.time}</span>
              <span
                className={`min-w-0 flex-1 font-bold ${i.estado === "feita" ? "text-tinta-suave line-through" : ""}`}
              >
                {i.title}
                {i.completion?.status === "pending" && (
                  <span className="ml-2 rounded-full bg-ceu-claro px-2 py-0.5 text-xs text-ceu-escuro no-underline">
                    esperando ok
                  </span>
                )}
              </span>
              {i.completion ? (
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center gap-1 font-extrabold text-ceu-escuro"
                  disabled={pendente || !c.canWrite}
                  onClick={() => {
                    const id = i.completion?.id;
                    if (id) rodar(() => desfazerAction(id));
                  }}
                >
                  <Undo2 className="size-4" aria-hidden="true" /> Desfazer
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center gap-1 font-extrabold text-ceu-escuro"
                  disabled={pendente || !c.canWrite}
                  onClick={() =>
                    rodar(() => marcarPelaCriancaAction({ childId: c.id, taskId: i.taskId }))
                  }
                >
                  <Check className="size-4" aria-hidden="true" /> Marcar
                </button>
              )}
            </li>
          ))}
          {!c.itens.length && (
            <li className="py-3 text-sm font-bold text-tinta-suave">
              Nenhuma tarefa hoje.{" "}
              <Link href={`/rotinas?crianca=${c.id}`} className="text-ceu-escuro underline">
                Criar rotina
              </Link>
            </li>
          )}
        </ul>
      )}
      <Erro texto={erro} />
    </section>
  );
}

"use client";
import { ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Estrela, Lumi } from "@/components/desenhos";
import { Icone } from "@/components/icone";
import { precoEmEstrelas } from "@/domain/estrelas";
import { pedirRecompensaAction } from "../actions";
import type { childPiggy } from "../dados";
import { falar } from "../som";

type Dados = Awaited<ReturnType<typeof childPiggy>>;
const cores = [
  "bg-ceu-escuro shadow-[0_5px_0_#1a4a86]",
  "bg-laranja-escuro shadow-[0_5px_0_#7c2f0e]",
  "bg-folha-botao shadow-[0_5px_0_var(--de-folha-sombra)]",
  "bg-uva-escura shadow-[0_5px_0_#3f2a8a]",
];

/** A loja de recompensas: o que dá para pedir com as estrelas livres. */
export function Loja({ dados }: { dados: Dados }) {
  const [pedido, setPedido] = useState<{ label: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState<string | null>(null);
  const livre = Math.max(0, dados.saldo - dados.guardadas);
  const itens = dados.rewards.map((r) => ({
    ...r,
    preco:
      r.kind === "money"
        ? precoEmEstrelas(r.moneyCents ?? 0, dados.starsPerReal)
        : (r.priceStars ?? 0),
  }));
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/crianca/cofrinho"
          aria-label="Voltar para o cofrinho"
          className="grid size-14 shrink-0 place-items-center rounded-full border-[3px] border-linha-forte bg-white shadow-[0_4px_0_var(--de-linha-forte)]"
        >
          <ArrowLeft className="size-6" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl leading-none font-extrabold sm:text-4xl">
            Loja de recompensas
          </h1>
          <p className="font-bold text-tinta-suave">Escolha o que trocar pelas suas estrelas</p>
        </div>
        {dados.guardadas > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full bg-estrela-clara px-4 py-2 text-sm font-extrabold text-estrela-texto">
            <Clock className="size-4" aria-hidden="true" /> {dados.guardadas} guardadas em pedidos
          </span>
        )}
        <span className="inline-flex h-[3.25rem] items-center gap-1.5 rounded-full border-[3px] border-[#f5d58a] bg-white pr-4 pl-2 font-display text-2xl font-extrabold text-estrela-texto shadow-[0_4px_0_#f5d58a]">
          <Estrela tamanho={30} /> {livre} livres
        </span>
      </header>
      {erro && <p className="chapa bg-laranja-clara p-3 font-bold text-laranja-escuro">{erro}</p>}
      {itens.length === 0 ? (
        <div className="chapa flex flex-col items-center gap-3 p-8 text-center">
          <Lumi tamanho={110} />
          <p className="font-display text-2xl font-extrabold">A loja ainda está vazia.</p>
          <p className="font-bold text-tinta-suave">
            Peça para os pais colocarem recompensas aqui.
          </p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((r, i) => {
            const falta = r.preco - livre;
            return (
              <li key={r.id} className="chapa flex flex-col gap-3 p-5">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid size-16 shrink-0 place-items-center rounded-2xl text-white ${cores[i % cores.length]}`}
                  >
                    <Icone nome={r.icon} className="size-8" />
                  </span>
                  <span className="font-display text-2xl leading-tight font-extrabold">
                    {r.name}
                  </span>
                </div>
                <span className="mt-auto inline-flex items-center gap-1.5 font-display text-xl font-extrabold text-estrela-texto">
                  <Estrela tamanho={24} /> {r.preco} estrelas
                </span>
                {falta > 0 ? (
                  <span className="grid min-h-14 place-items-center rounded-2xl bg-linha font-extrabold text-tinta-suave">
                    Faltam {falta}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="b3 b3-estrela"
                    disabled={pedindo !== null}
                    onClick={async () => {
                      setErro(null);
                      setPedindo(r.id);
                      const res = await pedirRecompensaAction({
                        childId: dados.child.id,
                        rewardId: r.id,
                      });
                      setPedindo(null);
                      if (res.ok) {
                        setPedido({ label: r.name });
                        falar(`Pedido feito: ${r.name}. Agora é com os pais.`);
                      } else setErro(res.error);
                    }}
                  >
                    {pedindo === r.id ? "Pedindo…" : "Pedir"}
                  </button>
                )}
              </li>
            );
          })}
          {dados.goal && (
            <li className="flex flex-col gap-3 rounded-[2rem] border-[3px] border-[#d9cef7] bg-uva-clara p-5 shadow-[0_7px_0_#d9cef7]">
              <p className="text-sm font-extrabold tracking-[0.12em] text-uva-escura">MINHA META</p>
              <p className="font-display text-2xl font-extrabold">{dados.goal.name}</p>
              <div className="mt-auto h-4 overflow-hidden rounded-full bg-[#e4dcfb]">
                <div
                  className="h-full rounded-full bg-uva-escura"
                  style={{ width: `${Math.min(100, (dados.saldo / dados.goal.stars) * 100)}%` }}
                />
              </div>
              <p className="font-display text-xl font-extrabold">
                {Math.min(dados.saldo, dados.goal.stars)} de {dados.goal.stars}
              </p>
            </li>
          )}
        </ul>
      )}
      {pedido && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-tinta/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pedido feito"
        >
          <div className="chapa entra flex w-full max-w-md flex-col items-center gap-3 p-6 text-center">
            <Lumi tamanho={110} humor="feliz" />
            <h2 className="font-display text-3xl font-extrabold">Pedido feito!</h2>
            <p className="text-lg font-bold text-tinta-suave">
              {pedido.label}: os pais vão ver o pedido. As estrelas ficam guardadas até eles
              entregarem.
            </p>
            <button type="button" className="b3 b3-folha w-full" onClick={() => setPedido(null)}>
              Combinado
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

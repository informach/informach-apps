"use client";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Estrela, Lumi } from "@/components/desenhos";
import { escolherCriancaAction } from "../actions";

export function QuemEstaUsando({
  criancas,
}: {
  criancas: { id: string; name: string; color: string; allowed: boolean; estrelas: number }[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState<string | null>(null);
  return (
    <main
      id="conteudo"
      className="relative flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10"
    >
      <Link
        href="/crianca/pin"
        aria-label="Área dos pais"
        className="absolute top-4 right-4 grid size-12 place-items-center rounded-full border-2 border-ceu-borda bg-white text-tinta-suave"
      >
        <Lock className="size-5" aria-hidden="true" />
      </Link>
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <Lumi tamanho={110} />
        <div>
          <h1 className="font-display text-4xl leading-none font-extrabold sm:text-6xl">
            Quem vai usar agora?
          </h1>
          <p className="mt-1 text-lg font-bold text-tinta-suave">Toque no seu nome.</p>
        </div>
      </div>
      <ul className="grid w-full max-w-4xl gap-5 sm:grid-cols-2">
        {criancas.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={!c.allowed || indo !== null}
              onClick={async () => {
                setIndo(c.id);
                setErro(null);
                const r = await escolherCriancaAction(c.id);
                if (r.ok) window.location.assign(r.data.destination);
                else {
                  setErro(r.error);
                  setIndo(null);
                }
              }}
              className="chapa flex w-full flex-col items-center gap-3 p-6 disabled:opacity-60"
              style={{ borderColor: `${c.color}55`, boxShadow: `0 10px 0 ${c.color}55` }}
            >
              <span
                className="grid size-28 place-items-center rounded-full font-display text-6xl font-extrabold text-white"
                style={{ background: c.color, boxShadow: "0 6px 0 rgba(0,0,0,.2)" }}
              >
                {c.name.charAt(0).toUpperCase()}
              </span>
              <span className="font-display text-4xl font-extrabold">{c.name}</span>
              <span className="inline-flex items-center gap-1.5 font-display text-xl font-extrabold text-estrela-texto">
                <Estrela tamanho={26} /> {c.estrelas} estrelas
              </span>
              <span
                className="flex min-h-16 w-full items-center justify-center rounded-2xl font-extrabold tracking-[0.04em] text-white uppercase"
                style={{ background: c.color, boxShadow: "0 6px 0 rgba(0,0,0,.22)" }}
              >
                {c.allowed ? (indo === c.id ? "Abrindo…" : "Sou eu!") : "Pausado pelo plano"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {erro && <p className="font-bold text-laranja-escuro">{erro}</p>}
      <p className="max-w-lg text-center font-bold text-tinta-suave">
        Quando chega a hora de alguém, o lembrete chama pelo nome.
      </p>
    </main>
  );
}

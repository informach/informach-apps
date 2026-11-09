"use client";
import { Delete, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { desbloquearPinAction } from "../actions";

/** Teclado do PIN dos pais. O PIN tem de 4 a 6 números; "Entrar" confere no servidor. */
export function TecladoPin() {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const aperta = (d: string) => {
    setErro(null);
    setValor((v) => (v.length < 6 ? v + d : v));
  };
  async function entrar() {
    setConferindo(true);
    const r = await desbloquearPinAction(valor);
    setConferindo(false);
    if (r.ok) window.location.assign(r.data.destination);
    else {
      setErro(r.error);
      setValor("");
    }
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-5 px-4 py-8">
      <span className="grid size-16 place-items-center rounded-full bg-white text-tinta shadow-[0_4px_0_var(--de-linha-forte)]">
        <Lock className="size-7" aria-hidden="true" />
      </span>
      <h1 className="font-display text-3xl font-extrabold">Área dos pais</h1>
      <p className="font-bold text-tinta-suave">Digite o PIN</p>
      <p className="sr-only" aria-live="polite">
        {valor.length} números digitados
      </p>
      <div className="flex gap-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={`ponto-${i.toString()}`}
            className={`size-4 rounded-full ${i < valor.length ? "bg-tinta" : i < 4 ? "border-[3px] border-linha-forte" : "border-2 border-dashed border-linha-forte"}`}
          />
        ))}
      </div>
      <p role="status" className="min-h-6 text-center font-bold text-laranja-escuro">
        {erro}
      </p>
      <div className="grid w-full grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => aperta(d)}
            className="b3 b3-claro b3-lg font-display text-3xl"
          >
            {d}
          </button>
        ))}
        <Link
          href="/crianca"
          className="b3 b3-lg bg-transparent text-base text-tinta-suave shadow-none"
        >
          Voltar
        </Link>
        <button
          type="button"
          onClick={() => aperta("0")}
          className="b3 b3-claro b3-lg font-display text-3xl"
        >
          0
        </button>
        <button
          type="button"
          aria-label="Apagar"
          onClick={() => setValor((v) => v.slice(0, -1))}
          className="b3 b3-lg bg-transparent text-tinta-suave shadow-none"
        >
          <Delete className="size-7" aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="b3 b3-ceu b3-lg w-full"
        disabled={valor.length < 4 || conferindo}
        onClick={() => void entrar()}
      >
        {conferindo ? "Conferindo…" : "Entrar"}
      </button>
    </div>
  );
}

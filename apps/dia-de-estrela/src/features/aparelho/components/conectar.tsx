"use client";
import Link from "next/link";
import { useState } from "react";

export function FormConectar({ inicial }: { inicial: string }) {
  const [codigo, setCodigo] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const limpo = codigo.toUpperCase().replace(/[^0-9A-Z]/g, "");
  async function conectar() {
    setIndo(true);
    setErro(null);
    const r = await fetch("/api/aparelho/conectar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: limpo }),
    });
    const corpo = (await r.json().catch(() => null)) as
      | { ok: true; data: { destination: string } }
      | { ok: false; error: string }
      | null;
    if (corpo?.ok) window.location.assign(corpo.data.destination);
    else {
      setErro(corpo && !corpo.ok ? corpo.error : "Não foi possível conectar. Tente de novo.");
      setIndo(false);
    }
  }
  return (
    <form
      className="chapa flex w-full max-w-md flex-col gap-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void conectar();
      }}
    >
      <label htmlFor="codigo" className="font-extrabold">
        Código de 10 letras e números
      </label>
      <input
        id="codigo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={14}
        placeholder="ABCDE-23456"
        className="h-16 rounded-2xl border-[3px] border-linha-forte bg-white text-center font-display text-3xl font-extrabold tracking-[0.15em] uppercase"
      />
      <button type="submit" className="b3 b3-folha b3-lg" disabled={indo || limpo.length !== 10}>
        {indo ? "Conectando…" : "Conectar"}
      </button>
      <p role="status" className="min-h-6 font-bold text-laranja-escuro">
        {erro}
      </p>
      <Link href="/entrar" className="text-sm font-extrabold text-ceu-escuro underline">
        Sou adulto · entrar com a conta
      </Link>
    </form>
  );
}

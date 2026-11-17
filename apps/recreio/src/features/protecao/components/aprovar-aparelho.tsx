"use client";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState, useTransition } from "react";
import { aprovarPareamentoAction } from "../actions";

export function AprovarAparelho({ perfilId, apelido }: { perfilId: string; apelido: string }) {
  const [codigo, setCodigo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [recente, setRecente] = useState(false);
  const [pendente, iniciar] = useTransition();
  const interativo = useHydrated();
  return (
    <section aria-labelledby="aprovar-aparelho" className="painel mt-6 p-5 sm:p-6">
      <h2 id="aprovar-aparelho" className="font-display text-xl font-bold [overflow-wrap:anywhere]">
        Parear um aparelho para {apelido}
      </h2>
      <p className="mt-2 text-tinta-suave">
        No aparelho que vai jogar, abra <strong>recreio.informach.com.br/parear</strong> e mostre o
        código. Confirme aqui somente o aparelho que você está preparando.
      </p>
      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          setMensagem("");
          iniciar(async () => {
            try {
              const resultado = await aprovarPareamentoAction({ perfilId, codigo });
              if (resultado.ok) {
                setMensagem("Aprovado. O outro aparelho vai confirmar a entrada.");
                setCodigo("");
              } else {
                setMensagem(resultado.error);
                setRecente(resultado.code === "AUTH" || resultado.code === "LOGIN_RECENTE");
              }
            } catch {
              setMensagem("Não foi possível confirmar. Você pode repetir o mesmo código.");
            }
          });
        }}
      >
        <fieldset disabled={!interativo || pendente} className="grid gap-3">
          <Label htmlFor="codigo-pareamento">Código mostrado no outro aparelho</Label>
          <Input
            id="codigo-pareamento"
            name="codigo-pareamento"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/[\s-]/g, "").toUpperCase())}
            maxLength={10}
            minLength={10}
            required
            autoComplete="off"
            spellCheck={false}
            className="h-12 bg-fundo font-mono text-xl tracking-wider"
          />
          <button
            type="submit"
            aria-label={`Confirmar aparelho de ${apelido}`}
            className="rb rb-sol justify-self-start"
          >
            {pendente ? "Confirmando…" : "Confirmar aparelho"}
          </button>
        </fieldset>
      </form>
      <p role="status" className="mt-3 min-h-5 text-sm font-semibold">
        {mensagem}
      </p>
      {recente && (
        <Link
          href={`/entrar?recente=1&next=${encodeURIComponent(`/conta/perfis/${perfilId}/aparelhos`)}`}
          className="font-bold text-ceu underline"
        >
          Entrar novamente para confirmar
        </Link>
      )}
    </section>
  );
}

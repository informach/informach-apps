"use client";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useState, useTransition } from "react";
import { definirPinMenorAction, definirPinNativoAction } from "../actions";

type Escopo = { tipo: "conta" } | { tipo: "menor"; perfilId: string };
export function DefinirPin({ escopo, definido }: { escopo: Escopo; definido: boolean }) {
  const [pin, setPin] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [recente, setRecente] = useState(false);
  const [pendente, iniciar] = useTransition();
  const interativo = useHydrated();
  const volta =
    escopo.tipo === "conta" ? "/conta/protecao" : `/conta/perfis/${escopo.perfilId}/aparelhos`;
  return (
    <section aria-labelledby="pin-protecao" className="painel mt-6 p-5 sm:p-6">
      <h2 id="pin-protecao" className="font-display text-xl font-bold">
        {escopo.tipo === "conta" ? "PIN da área do adulto" : "PIN deste perfil"}
      </h2>
      <p className="mt-2 text-tinta-suave">
        {escopo.tipo === "conta"
          ? "Use este PIN para voltar à sua área em um aparelho compartilhado. Guarde-o com você."
          : "Este PIN protege a escolha do perfil em aparelhos compartilhados. Ele não abre a área do adulto."}
      </p>
      <p className="mt-2 font-semibold">
        {definido ? "PIN configurado." : "PIN ainda não configurado."}
      </p>
      <form
        className="mt-5"
        onSubmit={(evento) => {
          evento.preventDefault();
          setErro("");
          if (pin !== confirmacao) {
            setErro("Os dois PINs precisam ser iguais.");
            return;
          }
          iniciar(async () => {
            try {
              const resultado =
                escopo.tipo === "conta"
                  ? await definirPinNativoAction({ pin })
                  : await definirPinMenorAction({ perfilId: escopo.perfilId, pin });
              if (resultado.ok) {
                setPin("");
                setConfirmacao("");
                window.location.reload();
              } else {
                setErro(resultado.error);
                setRecente(resultado.code === "AUTH" || resultado.code === "LOGIN_RECENTE");
              }
            } catch {
              setErro("Não foi possível salvar o PIN. Tente novamente.");
            }
          });
        }}
      >
        <fieldset disabled={!interativo || pendente} className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="novo-pin">Novo PIN</Label>
            <Input
              id="novo-pin"
              name="novo-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
              aria-describedby="pin-ajuda"
              className="mt-1.5 h-12 bg-fundo"
            />
          </div>
          <div>
            <Label htmlFor="confirmar-pin">Confirme o PIN</Label>
            <Input
              id="confirmar-pin"
              name="confirmar-pin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              required
              className="mt-1.5 h-12 bg-fundo"
            />
          </div>
          <p id="pin-ajuda" className="text-sm text-tinta-suave sm:col-span-2">
            Seis números. Evite sequências fáceis de adivinhar.
          </p>
          <button type="submit" className="rb rb-sol justify-self-start sm:col-span-2">
            {pendente ? "Salvando…" : "Salvar PIN"}
          </button>
        </fieldset>
      </form>
      <p role="status" className="mt-3 min-h-5 text-sm font-semibold text-coral">
        {erro}
      </p>
      {recente && (
        <Link
          href={`/entrar?recente=1&next=${encodeURIComponent(volta)}`}
          className="font-bold text-ceu underline"
        >
          Entrar novamente para confirmar
        </Link>
      )}
    </section>
  );
}

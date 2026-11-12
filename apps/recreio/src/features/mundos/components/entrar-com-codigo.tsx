"use client";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { useState, useTransition } from "react";
import { aceitarConviteAction } from "../actions";

/**
 * "Entrar com código": a pessoa digita (ou confirma) o código do convite e
 * entra no mundo com o perfil ativo. Abrir o endereço do convite não aceita
 * nada sozinho; é este botão que aceita.
 */
export function EntrarComCodigo({ inicial = "" }: { inicial?: string }) {
  const [codigo, setCodigo] = useState(inicial);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro("");
    iniciar(async () => {
      const resultado = await aceitarConviteAction(codigo);
      if (resultado.ok) {
        window.location.assign(resultado.data.destination);
        return;
      }
      setErro(
        resultado.code === "INPUT"
          ? "Confira o código. Ele pode estar incorreto, ter expirado ou já ter sido usado."
          : resultado.error,
      );
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-3">
      <div>
        <Label htmlFor="codigo-do-convite" className="font-bold">
          Código do convite
        </Label>
        <Input
          id="codigo-do-convite"
          name="codigo"
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="XXXXX-XXXXX"
          required
          className="mt-1.5 h-12 rounded-controle border-[1.5px] border-linha-forte bg-fundo font-semibold tracking-widest text-tinta"
        />
      </div>
      <div>
        <button type="submit" className="rb rb-vazado" disabled={pendente}>
          {pendente ? "Entrando…" : "Entrar no mundo"}
        </button>
        <p role="status" className="mt-2 min-h-5 text-sm font-semibold text-coral">
          {erro}
        </p>
      </div>
    </form>
  );
}

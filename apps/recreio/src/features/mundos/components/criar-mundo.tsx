"use client";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { useState, useTransition } from "react";
import { criarMundoAction } from "../actions";

/** "Criar mundo": só o nome. Os limites chegam do servidor, que é quem confere. */
export function CriarMundo({
  jogo,
  limites,
}: {
  jogo: string;
  limites: { min: number; max: number };
}) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro("");
    iniciar(async () => {
      const resultado = await criarMundoAction({ jogo, nome });
      if (resultado.ok) {
        window.location.assign(resultado.data.destination);
        return;
      }
      setErro(
        resultado.code === "INPUT"
          ? `O nome precisa ter de ${limites.min} a ${limites.max} caracteres.`
          : resultado.error,
      );
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-3">
      <div>
        <Label htmlFor={`nome-do-mundo-${jogo}`} className="font-bold">
          Nome do mundo
        </Label>
        <Input
          id={`nome-do-mundo-${jogo}`}
          name="nome"
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          maxLength={limites.max}
          autoComplete="off"
          required
          className="mt-1.5 h-12 rounded-controle border-[1.5px] border-linha-forte bg-fundo font-semibold text-tinta"
        />
      </div>
      <div>
        <button type="submit" className="rb rb-sol" disabled={pendente}>
          {pendente ? "Criando…" : "Criar mundo"}
        </button>
        <p role="status" className="mt-2 min-h-5 text-sm font-semibold text-coral">
          {erro}
        </p>
      </div>
    </form>
  );
}

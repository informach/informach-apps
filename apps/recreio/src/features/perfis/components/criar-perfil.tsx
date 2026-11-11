"use client";
import { Input } from "@informach/ui/components/input";
import { Label } from "@informach/ui/components/label";
import { cn } from "@informach/ui/lib/utils";
import { useState, useTransition } from "react";
import { criarPerfilAction } from "../actions";
import { AVATARES, type Avatar, NOME_DO_AVATAR } from "../avatares";
import { AvatarDoPerfil } from "./avatar";

/**
 * Primeiro uso: apelido e avatar do perfil da própria conta. Os limites do
 * apelido chegam do servidor, que é quem confere de verdade.
 */
export function CriarPerfil({ limites }: { limites: { min: number; max: number } }) {
  const [apelido, setApelido] = useState("");
  const [avatar, setAvatar] = useState<Avatar>("padrao");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro("");
    iniciar(async () => {
      const resultado = await criarPerfilAction({ apelido, avatar });
      if (resultado.ok) {
        window.location.assign(resultado.data.destination);
        return;
      }
      setErro(
        resultado.code === "INPUT"
          ? `O apelido precisa ter de ${limites.min} a ${limites.max} caracteres.`
          : resultado.error,
      );
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-6">
      <div className="flex items-center gap-4">
        <AvatarDoPerfil avatar={avatar} apelido={apelido || "?"} tamanho="lg" />
        <div className="min-w-0 flex-1">
          <Label htmlFor="apelido" className="font-bold">
            Apelido
          </Label>
          <Input
            id="apelido"
            name="apelido"
            value={apelido}
            onChange={(evento) => setApelido(evento.target.value)}
            maxLength={40}
            autoComplete="nickname"
            required
            aria-describedby="apelido-ajuda"
            className="mt-1.5 h-12 rounded-controle border-[1.5px] border-linha-forte bg-fundo font-semibold text-tinta"
          />
          <p id="apelido-ajuda" className="mt-1.5 text-sm text-tinta-suave">
            É o nome que aparece nos jogos. De {limites.min} a {limites.max} caracteres; melhor não
            usar o nome completo.
          </p>
        </div>
      </div>

      <fieldset>
        <legend className="font-bold">Avatar</legend>
        <div className="mt-3 flex flex-wrap gap-3">
          {AVATARES.map((opcao) => (
            <label
              key={opcao}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-controle border-[1.5px] p-2.5 text-sm font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ceu",
                avatar === opcao
                  ? "border-sol bg-painel-2 text-tinta"
                  : "border-linha text-tinta-suave",
              )}
            >
              <input
                type="radio"
                name="avatar"
                value={opcao}
                checked={avatar === opcao}
                onChange={() => setAvatar(opcao)}
                className="sr-only"
              />
              <AvatarDoPerfil avatar={opcao} apelido={apelido || "?"} />
              {NOME_DO_AVATAR[opcao]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <button type="submit" className="rb rb-sol rb-lg" disabled={pendente}>
          {pendente ? "Criando…" : "Criar perfil"}
        </button>
        <p role="status" className="mt-2 min-h-5 text-sm font-semibold text-coral">
          {erro}
        </p>
      </div>
    </form>
  );
}

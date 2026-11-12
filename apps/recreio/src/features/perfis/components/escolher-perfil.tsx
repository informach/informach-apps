"use client";
import { useState, useTransition } from "react";
import { selecionarPerfilAction } from "../actions";
import { AvatarDoPerfil } from "./avatar";

export type PerfilNaLista = { id: string; apelido: string; avatar: string; atual: boolean };

/** "Quem vai jogar?": a lista vem do servidor, e a escolha volta para ele conferir. */
export function EscolherPerfil({ perfis }: { perfis: PerfilNaLista[] }) {
  const [erro, setErro] = useState("");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function escolher(id: string) {
    setErro("");
    setEscolhido(id);
    iniciar(async () => {
      const resultado = await selecionarPerfilAction(id);
      if (resultado.ok) {
        window.location.assign(resultado.data.destination);
        return;
      }
      setEscolhido(null);
      setErro(resultado.error);
    });
  }

  return (
    <div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {perfis.map((perfil) => (
          <li key={perfil.id}>
            <button
              type="button"
              disabled={pendente}
              onClick={() => escolher(perfil.id)}
              className="painel flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-painel-2 disabled:opacity-60"
            >
              <AvatarDoPerfil avatar={perfil.avatar} apelido={perfil.apelido} />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-bold [overflow-wrap:anywhere]">
                  {perfil.apelido}
                </span>
                <span className="block text-sm text-tinta-suave">
                  {escolhido === perfil.id
                    ? "Entrando…"
                    : perfil.atual
                      ? "Jogando neste aparelho"
                      : "Jogar com este perfil"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p role="status" className="mt-3 min-h-5 text-sm font-semibold text-coral">
        {erro}
      </p>
    </div>
  );
}

"use client";
import type { ListaSocial } from "@informach/recreio/contrato";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useId, useState } from "react";
import { presencaSocialAction } from "../actions";
import { ErroSocial, useAcaoSocial } from "./acao";

const opcoes: { valor: ListaSocial["presenca"]; rotulo: string }[] = [
  { valor: "friends", rotulo: "Só amigos" },
  { valor: "online", rotulo: "Online" },
  { valor: "invisible", rotulo: "Invisível" },
];
export function PresencaDoPerfil({
  perfilId,
  presenca,
  editavel,
  acesso,
}: {
  perfilId: string;
  presenca: ListaSocial["presenca"];
  editavel: boolean;
  acesso: string;
}) {
  const id = useId(),
    hidratado = useHydrated(),
    acao = useAcaoSocial("/amigos");
  const [escolha, definirEscolha] = useState(presenca);
  return (
    <section aria-labelledby={`${id}-titulo`} className="painel mt-8 p-5 sm:p-6">
      <h2 id={`${id}-titulo`} className="font-display text-xl font-bold">
        Sua presença
      </h2>
      <p className="mt-2 text-sm text-tinta-suave">
        O Recreio não mostra o nome do mundo nem as suas relações de jogo.
      </p>
      {editavel ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            acao.executar(() => presencaSocialAction(perfilId, escolha));
          }}
        >
          <fieldset
            className="mt-4 flex flex-wrap gap-x-6 gap-y-2"
            disabled={!hidratado || acao.pendente}
          >
            <legend className="sr-only">Visibilidade da presença</legend>
            {opcoes.map((opcao) => (
              <label
                key={opcao.valor}
                className="flex min-h-11 items-center gap-2 text-sm font-semibold"
              >
                <input
                  type="radio"
                  name={`${id}-presenca`}
                  value={opcao.valor}
                  checked={escolha === opcao.valor}
                  onChange={() => definirEscolha(opcao.valor)}
                  className="size-5 accent-ceu"
                />
                {opcao.rotulo}
              </label>
            ))}
            <button type="submit" className="rb rb-vazado" disabled={escolha === presenca}>
              Salvar presença
            </button>
          </fieldset>
        </form>
      ) : (
        <p className="mt-3 text-sm font-semibold">
          Seu responsável cuida da visibilidade na supervisão do perfil.
        </p>
      )}
      <ErroSocial {...acao} destino="/amigos" acesso={acesso} />
    </section>
  );
}

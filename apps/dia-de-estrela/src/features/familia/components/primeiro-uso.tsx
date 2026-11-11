"use client";
import { Check } from "lucide-react";
import { useId, useState } from "react";
import { Erro, useAcao } from "@/components/acao";
import { Lumi } from "@/components/desenhos";

import { comecarAction } from "../actions";

const campo =
  "h-14 w-full rounded-2xl border-[3px] border-linha-forte bg-white px-4 text-lg font-bold placeholder:font-semibold placeholder:text-tinta-suave";

/** Primeiro uso: crianças → rotinas prontas → PIN dos pais. */
export function PrimeiroUso({
  limite,
  modelos,
  pessoas,
  contaUrl,
}: {
  limite: number;
  pessoas: { id: string; name: string; color: string }[];
  contaUrl: string;
  modelos: { id: string; name: string; tarefas: string[] }[];
}) {
  const ids = useId();
  const [passo, setPasso] = useState(0);
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [escolhidos, setEscolhidos] = useState<string[]>(modelos.map((m) => m.id));
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const { pendente, erro, setErro, rodar } = useAcao();

  function concluir() {
    if (pin !== pin2) {
      setErro("Os dois PINs não são iguais.");
      return;
    }
    rodar(
      () =>
        comecarAction({
          personIds,
          templateIds: escolhidos,
          pin,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
        }),
      (d) => window.location.assign(d.destination),
    );
  }

  return (
    <div className="chapa flex flex-col gap-5 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <Lumi tamanho={48} />
        <span className="font-display text-xl font-extrabold">Dia de Estrela</span>
        <span className="ml-auto font-bold text-tinta-suave">Passo {passo + 1} de 3</span>
      </div>

      {passo === 0 && (
        <>
          <div>
            <h1 className="font-display text-3xl font-extrabold">Quem vai usar?</h1>
            <p className="font-semibold text-tinta-suave">
              Escolha as crianças da sua família. Cada uma terá sua rotina, suas estrelas e seu
              cofrinho.
            </p>
          </div>
          {pessoas.map((pessoa) => (
            <label
              key={pessoa.id}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-linha-forte p-4 font-bold"
            >
              <input
                type="checkbox"
                className="size-5"
                checked={personIds.includes(pessoa.id)}
                disabled={!personIds.includes(pessoa.id) && personIds.length >= limite}
                onChange={(e) =>
                  setPersonIds(
                    e.target.checked
                      ? [...personIds, pessoa.id]
                      : personIds.filter((id) => id !== pessoa.id),
                  )
                }
              />
              <span
                className="size-8 rounded-full"
                style={{ background: pessoa.color }}
                aria-hidden="true"
              />
              {pessoa.name}
            </label>
          ))}
          {!pessoas.length && (
            <p className="rounded-xl bg-ceu-claro p-3 font-semibold">
              Cadastre uma criança na Minha conta para começar. Ao voltar, escolha a mesma pessoa
              aqui.
            </p>
          )}
          <a className="bp bp-claro" href={contaUrl}>
            Cadastrar ou revisar pessoas na Minha conta
          </a>
          <p className="text-sm font-semibold text-tinta-suave">
            Você pode ativar até {limite} {limite === 1 ? "criança" : "crianças"} com o acesso
            atual.
          </p>
          <button
            type="button"
            className="b3 b3-ceu b3-lg"
            disabled={!personIds.length}
            onClick={() => setPasso(1)}
          >
            Continuar
          </button>
        </>
      )}

      {passo === 1 && (
        <>
          <div>
            <h1 className="font-display text-3xl font-extrabold">Começar com rotinas prontas?</h1>
            <p className="font-semibold text-tinta-suave">
              Dá para mudar tudo depois: horários, passos, estrelas e dias da semana.
            </p>
          </div>
          {modelos.map((m) => {
            const on = escolhidos.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setEscolhidos(on ? escolhidos.filter((x) => x !== m.id) : [...escolhidos, m.id])
                }
                className={`flex items-start gap-3 rounded-2xl border-[3px] p-4 text-left ${
                  on ? "border-ceu-escuro bg-ceu-claro" : "border-linha bg-white"
                }`}
              >
                <span
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${on ? "bg-ceu-escuro text-white" : "border-2 border-linha-forte"}`}
                >
                  {on && <Check className="size-4" strokeWidth={3.5} aria-hidden="true" />}
                </span>
                <span>
                  <span className="block font-display text-xl font-extrabold">{m.name}</span>
                  <span className="block text-sm font-semibold text-tinta-suave">
                    {m.tarefas.join(" · ")}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="b3 b3-claro" onClick={() => setPasso(0)}>
              Voltar
            </button>
            <button type="button" className="b3 b3-ceu" onClick={() => setPasso(2)}>
              Continuar
            </button>
          </div>
        </>
      )}

      {passo === 2 && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            concluir();
          }}
        >
          <div>
            <h1 className="font-display text-3xl font-extrabold">PIN dos pais</h1>
            <p className="font-semibold text-tinta-suave">
              De 4 a 6 números. Abre a área dos pais no tablet da criança por 10 minutos.
            </p>
          </div>
          <label className="font-bold" htmlFor={`${ids}-pin`}>
            PIN
            <input
              id={`${ids}-pin`}
              className={`${campo} mt-1 font-display text-2xl tracking-[0.4em]`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => /^\d{0,6}$/.test(e.target.value) && setPin(e.target.value)}
            />
          </label>
          <label className="font-bold" htmlFor={`${ids}-pin2`}>
            Repita o PIN
            <input
              id={`${ids}-pin2`}
              className={`${campo} mt-1 font-display text-2xl tracking-[0.4em]`}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin2}
              onChange={(e) => /^\d{0,6}$/.test(e.target.value) && setPin2(e.target.value)}
            />
          </label>
          <Erro texto={erro} />
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="b3 b3-claro" onClick={() => setPasso(1)}>
              Voltar
            </button>
            <button
              type="submit"
              className="b3 b3-folha"
              disabled={pendente || pin.length < 4 || pin2.length < 4}
            >
              {pendente ? "Preparando…" : "Concluir"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

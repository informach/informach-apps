"use client";
import { Check, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { Erro, useAcao } from "@/components/acao";
import { Lumi } from "@/components/desenhos";
import { CORES_CRIANCA } from "@/domain/modelos";
import { comecarAction } from "../actions";

const campo =
  "h-14 w-full rounded-2xl border-[3px] border-linha-forte bg-white px-4 text-lg font-bold placeholder:font-semibold placeholder:text-tinta-suave";

/** Primeiro uso: crianças → rotinas prontas → PIN dos pais. */
export function PrimeiroUso({
  limite,
  modelos,
}: {
  limite: number;
  modelos: { id: string; name: string; tarefas: string[] }[];
}) {
  const ids = useId();
  const [passo, setPasso] = useState(0);
  const [nomes, setNomes] = useState<string[]>([""]);
  const [escolhidos, setEscolhidos] = useState<string[]>(modelos.map((m) => m.id));
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const { pendente, erro, setErro, rodar } = useAcao();
  const validos = nomes.map((n) => n.trim()).filter(Boolean);

  function concluir() {
    if (pin !== pin2) {
      setErro("Os dois PINs não são iguais.");
      return;
    }
    rodar(
      () =>
        comecarAction({
          children: validos.map((name, i) => ({
            name,
            color: CORES_CRIANCA[i % CORES_CRIANCA.length],
          })),
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
              Cada criança tem a sua rotina, as suas estrelas e o seu cofrinho. Só o apelido basta.
            </p>
          </div>
          {nomes.map((nome, i) => (
            <div key={`crianca-${i.toString()}`} className="flex items-center gap-3">
              <span
                className="grid size-12 shrink-0 place-items-center rounded-full font-display text-xl font-extrabold text-white"
                style={{ background: CORES_CRIANCA[i % CORES_CRIANCA.length] }}
              >
                {(nome.trim() || "?").charAt(0).toUpperCase()}
              </span>
              <label className="sr-only" htmlFor={`${ids}-${i}`}>
                Nome da criança {i + 1}
              </label>
              <input
                id={`${ids}-${i}`}
                className={campo}
                maxLength={24}
                value={nome}
                placeholder={`Nome da criança ${i + 1}`}
                onChange={(e) => setNomes(nomes.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {nomes.length > 1 && (
                <button
                  type="button"
                  aria-label="Tirar"
                  className="grid size-11 shrink-0 place-items-center text-tinta-suave"
                  onClick={() => setNomes(nomes.filter((_, j) => j !== i))}
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {nomes.length < limite ? (
            <button
              type="button"
              className="bp bp-claro self-start"
              onClick={() => setNomes([...nomes, ""])}
            >
              <Plus className="size-4" aria-hidden="true" /> Mais uma criança
            </button>
          ) : (
            limite === 1 && (
              <p className="rounded-xl bg-uva-clara p-3 text-sm font-bold text-uva-escura">
                O plano gratuito tem uma criança. Depois, em Ajustes, o plano Família libera até
                quatro.
              </p>
            )
          )}
          <button
            type="button"
            className="b3 b3-ceu b3-lg"
            disabled={!validos.length}
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

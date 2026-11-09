import { Banknote, Check, Clock, Gift, Sparkles } from "lucide-react";
import Link from "next/link";
import { Estrela, Porquinho } from "@/components/desenhos";
import { estrelasEmReais, previsaoDaMeta } from "@/domain/estrelas";
import type { childPiggy } from "../dados";
import { Cabecalho } from "./cabecalho";

type Dados = Awaited<ReturnType<typeof childPiggy>>;

function quando(data: Date) {
  const hoje = new Date();
  const d = new Date(data);
  const dias = Math.floor(
    (new Date(hoje.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000,
  );
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" });
}

const icone = {
  task: { Ic: Check, cor: "bg-folha-clara text-folha-escura" },
  bonus: { Ic: Sparkles, cor: "bg-uva-clara text-uva-escura" },
  chest: { Ic: Gift, cor: "bg-estrela-clara text-estrela-texto" },
  redeem: { Ic: Banknote, cor: "bg-linha text-tinta-suave" },
} as const;

export function Cofrinho({ dados, varias }: { dados: Dados; varias: boolean }) {
  const { child, goal } = dados;
  const livre = Math.max(0, dados.saldo - dados.guardadas);
  const faltam = goal ? Math.max(0, goal.stars - dados.saldo) : 0;
  const progresso = goal ? Math.min(100, (dados.saldo / goal.stars) * 100) : 0;
  const previsao = goal ? previsaoDaMeta(faltam, dados.earnedLastWeek) : null;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <Cabecalho
        nome={child.name}
        cor={child.color}
        titulo="Meu cofrinho"
        subtitulo={`${dados.starsPerReal} estrelas valem R$ 1,00`}
        aba="cofrinho"
        estrelas={dados.saldo}
        trocar={varias}
      />
      <div className="grid flex-1 gap-5 md:grid-cols-[minmax(0,1fr)_19rem] lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="flex flex-col items-center gap-4 rounded-[2rem] bg-uva-escura p-5 text-white shadow-[0_8px_0_#3f2a8a] sm:flex-row sm:p-7">
            <Porquinho largura={150} />
            <div className="flex-1 text-center sm:text-left">
              <p className="text-sm font-extrabold tracking-[0.14em]">VOCÊ TEM</p>
              <p className="font-display text-5xl leading-none font-extrabold sm:text-6xl">
                {dados.saldo} {dados.saldo === 1 ? "estrela" : "estrelas"}
              </p>
              <p className="mt-1 text-2xl font-extrabold text-estrela">
                = {estrelasEmReais(dados.saldo, dados.starsPerReal)}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <Link href="/crianca/loja" className="b3 b3-estrela b3-lg">
                <Gift className="size-6" aria-hidden="true" /> Loja
              </Link>
              {dados.guardadas > 0 && (
                <span className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold">
                  <Clock className="size-4" aria-hidden="true" /> {dados.guardadas} estrelas
                  esperando os pais
                </span>
              )}
            </div>
          </section>

          <section className="chapa flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
            {goal ? (
              <>
                <div
                  className="grid h-48 shrink-0 place-items-center rounded-3xl border-[3px] border-dashed border-[#cbbdf3] bg-uva-clara bg-cover bg-center sm:h-auto sm:w-56"
                  style={
                    goal.hasPhoto
                      ? { backgroundImage: `url(/api/meta/${child.id}/foto)` }
                      : undefined
                  }
                >
                  {!goal.hasPhoto && (
                    <Gift className="size-14 text-uva-escura" aria-hidden="true" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
                  <p className="text-sm font-extrabold tracking-[0.14em] text-uva-escura">
                    MINHA META
                  </p>
                  <h2 className="font-display text-4xl leading-none font-extrabold">{goal.name}</h2>
                  <p className="font-bold text-tinta-suave">
                    {estrelasEmReais(goal.stars, dados.starsPerReal)} · {goal.stars} estrelas
                  </p>
                  <div className="relative mx-3 h-8">
                    <div className="absolute inset-x-0 top-1.5 h-5 rounded-full bg-linha" />
                    <div
                      className="absolute top-1.5 left-0 h-5 rounded-full bg-estrela"
                      style={{ width: `${progresso}%` }}
                    />
                    {[25, 50, 75].map((m) => (
                      <span
                        key={m}
                        className={`absolute top-0 -ml-4 grid size-8 place-items-center rounded-full border-[3px] ${
                          progresso >= m
                            ? "border-estrela-escura bg-estrela"
                            : "border-linha-forte bg-white"
                        }`}
                        style={{ left: `${m}%` }}
                        aria-hidden="true"
                      >
                        {progresso >= m && <Estrela tamanho={14} />}
                      </span>
                    ))}
                    <span
                      className="absolute top-0 -ml-4 grid size-8 place-items-center rounded-full bg-uva-escura text-white"
                      style={{ left: "100%" }}
                      aria-hidden="true"
                    >
                      <Gift className="size-4" />
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 text-lg">
                    <strong>
                      {Math.min(dados.saldo, goal.stars)} de {goal.stars}
                    </strong>
                    <span className="font-bold text-tinta-suave">
                      {previsao ?? `faltam ${faltam} estrelas`}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center gap-2 py-6 text-center">
                <Gift className="size-14 text-uva-escura" aria-hidden="true" />
                <h2 className="font-display text-3xl font-extrabold">Qual é a sua meta?</h2>
                <p className="max-w-sm font-bold text-tinta-suave">
                  Conte para os pais o que você quer juntar estrelas para ganhar.
                </p>
              </div>
            )}
          </section>
          {livre > 0 && (
            <p className="text-center font-bold text-tinta-suave">
              {livre} estrelas livres para usar na loja.
            </p>
          )}
        </div>

        <aside className="chapa flex flex-col gap-1 p-5">
          <h2 className="mb-2 font-display text-2xl font-extrabold">Minhas estrelas</h2>
          {!dados.history.length && (
            <p className="font-bold text-tinta-suave">
              Quando você fizer tarefas, elas aparecem aqui.
            </p>
          )}
          <ul className="divide-y-2 divide-linha">
            {dados.history.map((h) => {
              const { Ic, cor } = icone[h.kind];
              return (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${cor}`}>
                    <Ic className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{h.label}</span>
                    <span className="block text-sm font-bold text-tinta-suave">
                      {quando(h.createdAt)}
                    </span>
                  </span>
                  <strong
                    className={`font-display text-xl ${h.stars > 0 ? "text-folha-escura" : "text-tinta-suave"}`}
                  >
                    {h.stars > 0 ? "+" : "−"}
                    {Math.abs(h.stars)}
                  </strong>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>
    </div>
  );
}

"use client";
import { Bau, Estrela, Lumi } from "@/components/desenhos";
import { Icone } from "@/components/icone";
import type { Tarefa } from "@/domain/rotina";

export type ResultadoConquista = {
  titulo: string;
  estrelas: number;
  pendente: boolean;
  /** Estrelas da surpresa do baú, se o baú abriu agora. */
  bau: number | null;
};

const confetes = [
  "left-[10%] top-[12%] h-7 w-4 rotate-[20deg] bg-estrela",
  "left-[20%] top-[30%] size-3 rounded-full bg-white/80",
  "left-[8%] top-[55%] h-6 w-4 -rotate-[30deg] bg-[#8fc1ff]",
  "left-[18%] top-[75%] h-7 w-4 rotate-[50deg] bg-estrela",
  "right-[10%] top-[14%] h-7 w-4 rotate-[35deg] bg-[#8fc1ff]",
  "right-[18%] top-[32%] h-7 w-4 -rotate-[20deg] bg-estrela",
  "right-[8%] top-[56%] size-3 rounded-full bg-white/80",
  "right-[16%] top-[76%] h-6 w-4 rotate-[15deg] bg-laranja",
];

/** Tarefa feita: festa curta (sem confete no modo calmo) e o caminho até o baú. */
export function Conquista({
  resultado,
  nome,
  calmo,
  feitas,
  total,
  proxima,
  aoContinuar,
}: {
  resultado: ResultadoConquista;
  nome: string;
  calmo: boolean;
  feitas: number;
  total: number;
  proxima?: Tarefa;
  aoContinuar: () => void;
}) {
  const faltam = total - feitas;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${resultado.titulo} feita`}
      className="entra fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-[#1d8049] px-4 py-8 text-center text-white"
    >
      {!calmo && (
        <div aria-hidden="true">
          {confetes.map((c) => (
            <span key={c} className={`absolute rounded ${c}`} />
          ))}
        </div>
      )}
      <Lumi tamanho={150} humor="feliz" />
      <div>
        <p className="text-lg font-extrabold tracking-[0.14em] text-white">
          MANDOU BEM, {nome.toUpperCase()}!
        </p>
        <h1 className="font-display text-5xl leading-none font-extrabold sm:text-7xl">
          {resultado.titulo} feita!
        </h1>
      </div>
      <span className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 font-display text-4xl font-extrabold text-estrela-texto shadow-[0_6px_0_#12552f]">
        <Estrela tamanho={44} /> +{resultado.estrelas}{" "}
        {resultado.estrelas === 1 ? "estrela" : "estrelas"}
      </span>
      {resultado.pendente && (
        <p className="max-w-md text-lg font-bold text-white">
          As estrelas entram no cofrinho quando os pais derem o ok.
        </p>
      )}
      <div className="flex w-full max-w-lg items-center gap-4 rounded-3xl bg-white/15 p-4 text-left">
        <Bau largura={70} aberto={faltam === 0} />
        <div className="flex-1">
          <div className="flex justify-between text-lg font-extrabold">
            <span>Baú do dia</span>
            <span>
              {feitas} de {total}
            </span>
          </div>
          <div className="mt-1 h-4 overflow-hidden rounded-full bg-black/20">
            <div
              className="h-full rounded-full bg-estrela"
              style={{ width: `${total ? (feitas / total) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-1 font-bold text-white">
            {resultado.bau
              ? `O baú abriu! +${resultado.bau} estrelas de surpresa.`
              : faltam === 0
                ? "O baú do dia abriu!"
                : `Mais ${faltam} ${faltam === 1 ? "tarefa" : "tarefas"} e o baú abre.`}
          </p>
        </div>
      </div>
      {proxima && (
        <p className="flex items-center gap-2 text-lg font-bold text-white">
          <Icone nome={proxima.icon} className="size-6" /> Próxima: {proxima.title.toLowerCase()} às{" "}
          {proxima.time}
        </p>
      )}
      <button
        type="button"
        onClick={aoContinuar}
        className="b3 b3-lg bg-white text-[#12552f] [--b3-sombra:#12552f] sm:min-w-96"
      >
        Continuar
      </button>
    </div>
  );
}

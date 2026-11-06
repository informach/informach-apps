import { Lock, PiggyBank, Sun } from "lucide-react";
import Link from "next/link";
import { Estrela } from "@/components/desenhos";

/** Topo das telas da criança: quem é, onde está, quantas estrelas tem, e o cadeado dos pais. */
export function Cabecalho({
  nome,
  cor,
  titulo,
  subtitulo,
  aba,
  estrelas,
  trocar,
}: {
  nome: string;
  cor: string;
  titulo: string;
  subtitulo: string;
  aba: "hoje" | "cofrinho";
  estrelas: number;
  trocar: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {trocar ? (
          <Link
            href="/crianca?trocar=1"
            aria-label="Trocar de criança"
            className="grid size-12 shrink-0 place-items-center rounded-full font-display text-2xl font-extrabold text-white sm:size-14"
            style={{ background: cor, boxShadow: "0 4px 0 rgba(0,0,0,.18)" }}
          >
            {nome.charAt(0).toUpperCase()}
          </Link>
        ) : (
          <span
            className="grid size-12 shrink-0 place-items-center rounded-full font-display text-2xl font-extrabold text-white sm:size-14"
            style={{ background: cor, boxShadow: "0 4px 0 rgba(0,0,0,.18)" }}
            aria-hidden="true"
          >
            {nome.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="line-clamp-2 font-display text-2xl leading-tight font-extrabold sm:truncate sm:text-4xl sm:leading-none">
            {titulo}
          </h1>
          <p className="text-sm font-bold text-tinta-suave sm:truncate sm:text-base">{subtitulo}</p>
        </div>
      </div>
      {/* No celular: estrelas e cadeado ao lado do nome, abas numa linha só delas.
          Do `sm` para cima, tudo numa linha (abas no meio). */}
      <div className="order-2 flex shrink-0 items-center gap-2 sm:order-3">
        <span className="inline-flex h-12 items-center gap-1 rounded-full border-[3px] border-[#f5d58a] bg-white pr-3 pl-1.5 font-display text-xl font-extrabold text-estrela-texto shadow-[0_4px_0_#f5d58a] sm:h-[3.25rem] sm:gap-1.5 sm:pr-4 sm:pl-2 sm:text-2xl">
          <Estrela tamanho={28} /> {estrelas}
          <span className="sr-only"> estrelas</span>
        </span>
        <Link
          href="/crianca/pin"
          aria-label="Área dos pais"
          className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-linha-forte bg-white text-tinta-suave"
        >
          <Lock className="size-5" aria-hidden="true" />
        </Link>
      </div>
      <nav className="order-3 flex w-full gap-2 sm:order-2 sm:w-auto" aria-label="Telas">
        <Link
          href="/crianca/hoje"
          aria-current={aba === "hoje" ? "page" : undefined}
          className={`b3 flex-1 px-4 text-sm sm:flex-none ${aba === "hoje" ? "b3-ceu" : "b3-claro"}`}
        >
          <Sun className="size-5" aria-hidden="true" /> Hoje
        </Link>
        <Link
          href="/crianca/cofrinho"
          aria-current={aba === "cofrinho" ? "page" : undefined}
          className={`b3 flex-1 px-4 text-sm sm:flex-none ${aba === "cofrinho" ? "b3-uva" : "b3-claro"}`}
        >
          <PiggyBank className="size-5" aria-hidden="true" /> Cofrinho
        </Link>
      </nav>
    </header>
  );
}

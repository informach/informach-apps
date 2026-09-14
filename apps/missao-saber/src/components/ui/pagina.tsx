import { cn } from "@informach/ui/lib/utils";
import { type Tom, tomClaro } from "./chapa";

/** Etiqueta curta. Substitui o `.eyebrow` em caixa-alta do visual antigo. */
/**
 * O texto da etiqueta é sempre tinta: a 12px ele precisa de 4,5:1, e os
 * tons médios (`-fundo`) sobre os fundos claros ficavam entre 2,8:1 e
 * 3,9:1. Quem carrega a cor aqui é o fundo, não a letra.
 */
const tonsEtiqueta: Record<Tom, string> = {
  verde: "bg-verde-claro text-tinta border-verde/30",
  uva: "bg-uva-claro text-tinta border-uva/30",
  sol: "bg-sol-claro text-tinta border-sol/40",
  coral: "bg-coral-claro text-tinta border-coral/35",
  ceu: "bg-ceu-claro text-tinta border-ceu/30",
  lima: "bg-lima/40 text-tinta border-lima-fundo/40",
  creme: "bg-creme text-tinta-suave border-sombra",
};

export function Etiqueta({
  tom = "creme",
  className,
  children,
}: {
  tom?: Tom;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 font-display text-xs font-semibold",
        tonsEtiqueta[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Cabeçalho de página das telas do estudante. */
export function CabecalhoPagina({
  etiqueta,
  titulo,
  apoio,
  acessorio,
  className,
}: {
  etiqueta?: React.ReactNode;
  titulo: React.ReactNode;
  apoio?: React.ReactNode;
  acessorio?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-7 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {etiqueta}
        <h1 className="mt-2 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
          {titulo}
        </h1>
        {apoio && <p className="mt-2 max-w-2xl text-tinta-suave">{apoio}</p>}
      </div>
      {acessorio}
    </header>
  );
}

/** Ladrilho de contagem. Números grandes, rótulo legível. */
export function Ladrilho({
  valor,
  sufixo,
  rotulo,
  tom = "creme",
  extra,
}: {
  valor: React.ReactNode;
  sufixo?: string;
  rotulo: string;
  tom?: Tom;
  extra?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-card border-2 p-4 shadow-chapa", tomClaro[tom])}>
      <p className="font-display text-4xl leading-none font-semibold text-tinta">
        {valor}
        {sufixo && <span className="ml-1 text-lg text-tinta-suave">{sufixo}</span>}
      </p>
      <p className="mt-2 text-sm leading-snug text-tinta-suave">{rotulo}</p>
      {extra && <div className="mt-3">{extra}</div>}
    </div>
  );
}

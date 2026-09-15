import { cn } from "@informach/ui/lib/utils";
import { Check, LockKeyhole, Star } from "lucide-react";

/**
 * Nó hexagonal da trilha de "Minha jornada".
 *
 * A profundidade vem de um hexágono escuro deslocado atrás — box-shadow
 * não acompanha `clip-path`. Pelo mesmo motivo o anel do nó atual pulsa
 * por escala, não por sombra.
 *
 * O estado nunca é só cor: cada um traz ícone e texto próprios.
 */
export type EstadoNo = "concluido" | "atual" | "disponivel" | "bloqueado";

const HEX = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

const cores: Record<EstadoNo, { frente: string; fundo: string; tinta: string }> = {
  concluido: {
    frente: "bg-verde-solido",
    fundo: "bg-verde-solido-sombra",
    tinta: "text-sobre-verde",
  },
  atual: { frente: "bg-lima", fundo: "bg-lima-fundo", tinta: "text-tinta" },
  disponivel: { frente: "bg-creme", fundo: "bg-sombra", tinta: "text-tinta" },
  bloqueado: { frente: "bg-muted", fundo: "bg-sombra", tinta: "text-tinta-suave" },
};

export function NoTrilha({
  estado,
  numero,
  className,
}: {
  estado: EstadoNo;
  numero: number;
  className?: string;
}) {
  const c = cores[estado];
  return (
    <span
      aria-hidden="true"
      className={cn("relative grid size-[68px] shrink-0 place-items-center", className)}
    >
      {estado === "atual" && (
        <span
          className="absolute inset-0 bg-lima motion-safe:animate-pulsar-no"
          style={{ clipPath: HEX }}
        />
      )}
      <span
        className={cn("absolute inset-0 translate-y-[5px]", c.fundo)}
        style={{ clipPath: HEX }}
      />
      <span className={cn("absolute inset-0", c.frente)} style={{ clipPath: HEX }} />
      <span className={cn("relative font-display text-lg font-semibold", c.tinta)}>
        {estado === "concluido" ? (
          <Check size={26} strokeWidth={3.2} />
        ) : estado === "bloqueado" ? (
          <LockKeyhole size={22} strokeWidth={2.6} />
        ) : estado === "atual" ? (
          <Star size={24} strokeWidth={2.6} className="fill-current" />
        ) : (
          numero
        )}
      </span>
    </span>
  );
}

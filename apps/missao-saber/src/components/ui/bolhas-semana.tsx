import { cn } from "@informach/ui/lib/utils";

/**
 * Dias com descobertas na semana.
 *
 * Deliberadamente uma CONTAGEM, não uma corrente: não há "ofensiva" a
 * perder nem culpa por dia vazio. A proposta do produto proíbe mecânicas
 * de punição por ausência.
 */
const POSICOES = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"] as const;

export function BolhasSemana({ dias, className }: { dias: number; className?: string }) {
  return (
    <div className={cn("flex gap-1.5", className)} aria-hidden="true">
      {POSICOES.map((id, posicao) => (
        <span
          key={id}
          className={cn(
            "size-3.5 rounded-full border-2",
            posicao < dias ? "border-verde-fundo bg-verde" : "border-sombra bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

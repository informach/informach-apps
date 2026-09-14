import { cn } from "@informach/ui/lib/utils";

/**
 * Progresso da missão: um bloco por questão, em vez de uma barra fina.
 * A criança vê quantos passos faltam, não uma porcentagem abstrata.
 */
export function ProgressoSegmentado({
  total,
  feitos,
  className,
}: {
  total: number;
  feitos: number;
  className?: string;
}) {
  const blocos = Array.from({ length: total }, (_, posicao) => ({
    id: `q${posicao + 1}`,
    cheio: posicao < feitos,
  }));
  return (
    <div
      className={cn("flex gap-1.5", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={feitos}
      aria-label={`Progresso da missão: ${feitos} de ${total}`}
    >
      {blocos.map(({ id, cheio }) => (
        <span
          key={id}
          className={cn(
            "h-3 flex-1 overflow-hidden rounded-full",
            cheio ? "bg-verde" : "bg-sombra/70",
          )}
        >
          {cheio && (
            <span className="block h-full w-full origin-left rounded-full bg-verde motion-safe:animate-encher" />
          )}
        </span>
      ))}
    </div>
  );
}

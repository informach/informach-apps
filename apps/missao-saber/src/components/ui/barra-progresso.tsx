import { cn } from "@informach/ui/lib/utils";

/**
 * Barra de progresso do capítulo.
 *
 * `ProgressoSegmentado` mostra um bloco por questão e funciona dentro de uma
 * missão de cinco a oito passos; um capítulo tem dezenas de descobertas e
 * pediria blocos de um pixel. Aqui a contagem exata vem escrita ao lado, então
 * a barra é decorativa para leitores de tela.
 */
export function BarraProgresso({
  feitos,
  total,
  className,
}: {
  feitos: number;
  total: number;
  className?: string;
}) {
  const proporcao = total > 0 ? Math.min(Math.max(feitos / total, 0), 1) : 0;
  return (
    <div
      aria-hidden="true"
      className={cn("h-2.5 w-full overflow-hidden rounded-full bg-sombra/70", className)}
    >
      <div
        className="h-full rounded-full bg-verde-solido"
        style={{ width: `${Math.round(proporcao * 100)}%` }}
      />
    </div>
  );
}

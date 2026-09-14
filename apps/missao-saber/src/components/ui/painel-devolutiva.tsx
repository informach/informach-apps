import { cn } from "@informach/ui/lib/utils";
import { Check, Compass } from "lucide-react";
import { Mascote } from "../mascote";

/**
 * Devolutiva da questão, ancorada no rodapé.
 *
 * Erro NUNCA usa vermelho nem linguagem de punição: o produto trata a
 * tentativa difícil como parte do caminho ("Vamos encontrar o caminho").
 * O significado vem de ícone + título + cor, nunca só da cor.
 */
export function PainelDevolutiva({
  acertou,
  titulo,
  explicacao,
  nota,
  children,
}: {
  acertou: boolean;
  titulo: string;
  explicacao: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        // No desktop o painel começa depois do rail, para não cobrir a
        // navegação. A largura vem do mesmo token usado pelo grid do layout.
        "fixed inset-x-0 bottom-0 z-40 border-t-2 lg:left-[var(--ms-rail)] motion-safe:animate-subir",
        acertou ? "border-verde-fundo bg-verde-claro" : "border-coral-fundo bg-coral-claro",
      )}
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
        <Mascote
          humor={acertou ? "comemorando" : "encorajando"}
          tamanho="p"
          flutua={false}
          className="hidden sm:block"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-display text-xl font-semibold text-tinta">
            <span
              aria-hidden="true"
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-full text-white",
                acertou ? "bg-verde-solido" : "bg-coral-solido",
              )}
            >
              {acertou ? (
                <Check size={19} strokeWidth={3.2} />
              ) : (
                <Compass size={18} strokeWidth={2.8} />
              )}
            </span>
            {titulo}
          </p>
          <p className="mt-2 text-[0.975rem] leading-relaxed text-tinta">{explicacao}</p>
          {nota && <p className="mt-1.5 text-sm text-tinta-suave">{nota}</p>}
        </div>
        <div className="shrink-0 sm:self-center">{children}</div>
      </div>
    </div>
  );
}

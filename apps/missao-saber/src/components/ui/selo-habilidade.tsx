import { cn } from "@informach/ui/lib/utils";
import { Check, Sparkles } from "lucide-react";

/**
 * Selo de habilidade em três estágios, espelhando `skillStates()` do
 * engine: a explorar → em construção → evidências de autonomia.
 *
 * Não é pontuação: é o estado pedagógico que o app já calculava e só
 * mostrava como texto em caixa-alta.
 */
export type Nivel = "starting" | "building" | "independent";

const rotulos: Record<Nivel, string> = {
  starting: "A explorar",
  building: "Em construção",
  independent: "Evidências de autonomia",
};

export function SeloHabilidade({
  nivel,
  className,
  comTexto = true,
}: {
  nivel: Nivel;
  className?: string;
  comTexto?: boolean;
}) {
  const cores =
    nivel === "independent"
      ? "bg-verde-solido text-sobre-verde border-verde-solido-sombra"
      : nivel === "building"
        ? // Par sólido, não o tom vivo: no tema escuro `--ms-sol` clareia e
          // `--ms-tinta` vira quase branco, o que apagaria o selo inteiro.
          "bg-sol-solido text-sobre-sol border-sol-fundo"
        : "bg-creme text-tinta-suave border-sombra";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 font-display text-xs font-semibold",
        cores,
        className,
      )}
    >
      {/* ícone além da cor: cor nunca carrega sozinha o significado */}
      {nivel === "independent" ? (
        <Check size={14} strokeWidth={3} aria-hidden="true" />
      ) : nivel === "building" ? (
        <Sparkles size={14} strokeWidth={2.6} aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className="size-2 rounded-full border-2 border-current" />
      )}
      {/* Na forma compacta o ícone é decorativo, então o rótulo continua
          presente para leitores de tela — senão o selo não diria nada. */}
      {comTexto ? rotulos[nivel] : <span className="sr-only">{rotulos[nivel]}</span>}
    </span>
  );
}

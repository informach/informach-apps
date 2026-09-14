import { cn } from "@informach/ui/lib/utils";

/**
 * "Chapa" — a linguagem de forma das telas do estudante.
 *
 * Sombra sólida sem blur + borda de 2px, e afundar ao pressionar. É o que
 * dá o ar tátil das referências (Duolingo, Eureka) sem copiar nenhuma
 * delas. Todas as cores vêm dos tokens --ms-* definidos em globals.css.
 */

export type Tom = "verde" | "uva" | "sol" | "coral" | "ceu" | "lima" | "creme";

/**
 * Superfícies sólidas.
 *
 * Tons escuros levam texto branco; tons claros (sol, lima, creme) levam
 * texto em tinta. Todos os pares passam de 4,5:1 — as cores vivas da
 * paleta são claras demais para branco e ficam reservadas a fundos suaves.
 */
export const tomSolido: Record<Tom, string> = {
  verde: "bg-verde-solido text-white shadow-[0_5px_0_var(--ms-verde-solido-sombra)]",
  uva: "bg-uva-solido text-white shadow-[0_5px_0_var(--ms-uva-solido-sombra)]",
  sol: "bg-sol text-tinta shadow-[0_5px_0_var(--ms-sol-fundo)]",
  coral: "bg-coral-solido text-white shadow-[0_5px_0_var(--ms-coral-solido-sombra)]",
  ceu: "bg-ceu-solido text-white shadow-[0_5px_0_var(--ms-ceu-solido-sombra)]",
  lima: "bg-lima text-tinta shadow-[0_5px_0_var(--ms-lima-fundo)]",
  creme: "bg-creme text-tinta shadow-[0_5px_0_var(--ms-sombra)]",
};

/**
 * Fundo claro + borda colorida: a base de toda superfície de apoio.
 * Compartilhada pela Chapa e pelo Ladrilho para que os dois não divirjam.
 */
export const tomClaro: Record<Tom, string> = {
  verde: "bg-verde-claro border-verde/35",
  uva: "bg-uva-claro border-uva/35",
  sol: "bg-sol-claro border-sol/45",
  coral: "bg-coral-claro border-coral/40",
  ceu: "bg-ceu-claro border-ceu/35",
  lima: "bg-lima/35 border-lima-fundo/45",
  creme: "bg-creme border-sombra",
};

/** Sombra sólida tingida pela própria família do tom. */
const sombraSuave: Record<Tom, string> = {
  verde: "shadow-[0_4px_0_color-mix(in_oklab,var(--ms-verde)_28%,transparent)]",
  uva: "shadow-[0_4px_0_color-mix(in_oklab,var(--ms-uva)_25%,transparent)]",
  sol: "shadow-[0_4px_0_color-mix(in_oklab,var(--ms-sol)_32%,transparent)]",
  coral: "shadow-[0_4px_0_color-mix(in_oklab,var(--ms-coral)_28%,transparent)]",
  ceu: "shadow-[0_4px_0_color-mix(in_oklab,var(--ms-ceu)_28%,transparent)]",
  lima: "shadow-[0_4px_0_color-mix(in_oklab,var(--ms-lima-fundo)_35%,transparent)]",
  creme: "shadow-chapa",
};

/** Superfície estática. Use `interativa` quando o card inteiro for clicável. */
export function Chapa({
  tom = "creme",
  interativa = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { tom?: Tom; interativa?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border-2 p-5",
        tomClaro[tom],
        sombraSuave[tom],
        interativa &&
          "transition-transform duration-100 hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

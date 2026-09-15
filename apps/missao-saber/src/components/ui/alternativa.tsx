"use client";

import { cn } from "@informach/ui/lib/utils";

/**
 * Alternativa de resposta.
 *
 * Continua sendo um <input type="radio"> real: o input cobre todo o card
 * (alvo de toque inteiro, foco por teclado, `getByRole("radio")` no E2E)
 * e o visual fica num irmão estilizado por `peer-*`.
 *
 * A letra é `aria-hidden` de propósito — assim o nome acessível do radio
 * é exatamente o texto da alternativa, tanto para leitor de tela quanto
 * para o teste que procura `{ name: "R$ 140", exact: true }`.
 */
export function Alternativa({
  name,
  valor,
  letra,
  marcada,
  desabilitada,
  onEscolher,
}: {
  name: string;
  valor: string;
  letra?: string;
  marcada: boolean;
  desabilitada?: boolean;
  onEscolher: () => void;
}) {
  return (
    <label className="relative block">
      <input
        type="radio"
        name={name}
        value={valor}
        checked={marcada}
        disabled={desabilitada}
        onChange={onEscolher}
        className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-controle disabled:cursor-default"
      />
      <span
        className={cn(
          "pointer-events-none flex min-h-16 items-center gap-3.5 rounded-controle border-2 px-4 py-3",
          "text-base leading-snug transition-[transform,box-shadow,background-color] duration-100",
          "border-sombra bg-creme text-tinta shadow-chapa",
          "peer-hover:border-verde/60",
          "peer-checked:border-verde-fundo peer-checked:bg-verde-claro peer-checked:shadow-[0_4px_0_var(--ms-verde-fundo)]",
          "peer-active:translate-y-1 peer-active:shadow-none motion-reduce:peer-active:translate-y-0",
          "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-uva",
          "peer-disabled:opacity-70",
        )}
      >
        {letra && (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full border-2 font-display text-sm font-semibold",
              marcada
                ? "border-verde-fundo bg-verde-solido text-sobre-verde"
                : "border-sombra bg-papel text-tinta-suave",
            )}
          >
            {letra}
          </span>
        )}
        <span className="min-w-0 font-semibold">{valor}</span>
      </span>
    </label>
  );
}

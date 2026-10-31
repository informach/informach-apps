"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { installFocusNav, moveFocus } from "@/features/treino/focus-nav";

/**
 * Navegação por setas para controle remoto de TV e teclado. O botão Voltar do
 * controle volta uma página; ao trocar de página, o foco vai para o elemento
 * marcado com `data-autofocus`.
 */
export function FocusNav() {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => installFocusNav(() => router.back()), [router]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: o foco é refeito a cada troca de página
  useEffect(() => {
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>("[data-autofocus]");
      if (el) el.focus({ preventScroll: true });
      else if (!document.activeElement || document.activeElement === document.body)
        moveFocus("ArrowDown");
    }, 60);
    return () => clearTimeout(t);
  }, [path]);
  return null;
}

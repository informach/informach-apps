"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

type ThemeProviderProps = ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

/**
 * O tema atual e a troca, para quem põe a escolha dentro de um menu próprio
 * (a conta da Agenda). Reexportado daqui porque os apps não dependem de
 * `next-themes` diretamente.
 */
export { useTheme } from "next-themes";

import type { ReactNode } from "react";

/**
 * Cadastro e entrada, como no canvas do começo: o fundo do app, sem cabeçalho
 * e sem cartão. Cada tela traz o símbolo no canto (o link para a página
 * inicial) e o seu título; o cadastro traz também as barras das etapas.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-app-ground text-foreground">
      <main className="flex flex-1 justify-center">{children}</main>
    </div>
  );
}

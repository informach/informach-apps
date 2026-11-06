import Link from "next/link";
import { Lumi } from "./desenhos";

/** Moldura das páginas públicas de texto (termos, privacidade). */
export function PaginaDeTexto({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-creme">
      <header className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-5">
        <Link href="/" className="flex items-center gap-2">
          <Lumi tamanho={36} />
          <span className="font-display text-xl font-extrabold">Dia de Estrela</span>
        </Link>
        <span className="flex-1" />
        <Link href="/entrar" className="bp bp-claro">
          Entrar
        </Link>
      </header>
      <main
        id="conteudo"
        className="mx-auto max-w-3xl px-4 pb-16 [&_a]:font-bold [&_a]:text-ceu-escuro [&_a]:underline [&_h1]:mb-4 [&_h1]:font-display [&_h1]:text-4xl [&_h1]:font-extrabold [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-extrabold [&_p]:mb-3 [&_p]:text-lg [&_p]:leading-relaxed"
      >
        {children}
      </main>
    </div>
  );
}

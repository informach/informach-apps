import { INFORMACH_CONTACT } from "@informach/config/contact";
import Link from "next/link";
import { Marca } from "./desenhos";

/** Rodapé das páginas públicas. O contato é o direct do Instagram, nunca um e-mail. */
export function Rodape() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-5 gap-y-2 px-4 py-8 text-sm font-semibold text-tinta-suave sm:px-8">
      <span>Informach · Helena e Júlio</span>
      <Link href="/termos" className="underline underline-offset-4 hover:text-tinta">
        Termos
      </Link>
      <Link href="/privacidade" className="underline underline-offset-4 hover:text-tinta">
        Privacidade
      </Link>
      <a
        href={INFORMACH_CONTACT.directMessageUrl}
        className="underline underline-offset-4 hover:text-tinta"
      >
        Fale com a gente no Instagram
      </a>
    </footer>
  );
}

/** Moldura das páginas públicas de texto (termos, privacidade). */
export function PaginaDeTexto({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-5">
        <Link href="/" aria-label="Recreio, página inicial">
          <Marca tamanho={30} />
        </Link>
        <span className="flex-1" />
        <Link href="/entrar" className="rb rb-vazado">
          Entrar
        </Link>
      </header>
      <main
        id="conteudo"
        className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-10 [&_a]:font-bold [&_a]:text-ceu [&_a]:underline [&_a]:underline-offset-4 [&_h1]:mb-5 [&_h1]:font-display [&_h1]:text-4xl [&_h1]:leading-tight [&_h1]:font-extrabold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_p]:mb-3 [&_p]:text-lg [&_p]:leading-relaxed"
      >
        {children}
      </main>
      <Rodape />
    </div>
  );
}

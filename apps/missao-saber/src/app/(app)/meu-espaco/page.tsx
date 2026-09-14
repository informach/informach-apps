import { BookOpen, History, NotebookPen, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Chapa, type Tom } from "@/components/ui/chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";

export const metadata: Metadata = { title: "Meu espaço" };

/**
 * Hub dos destinos secundários. Existe para a barra inferior do celular
 * caber em cinco abas; no desktop o rail lateral já lista tudo direto.
 */
const DESTINOS: {
  href: string;
  titulo: string;
  texto: string;
  Icone: typeof BookOpen;
  tom: Tom;
}[] = [
  {
    href: "/simulados",
    titulo: "Simulados",
    texto: "Percursos sem pistas, com a devolutiva toda no final.",
    Icone: BookOpen,
    tom: "ceu",
  },
  {
    href: "/caderno",
    titulo: "Meu caderno",
    texto: "Guarde suas estratégias e seus “ah, entendi!”.",
    Icone: NotebookPen,
    tom: "sol",
  },
  {
    href: "/historico",
    titulo: "Meu histórico",
    texto: "Tudo o que você já percorreu, para retomar ou rever.",
    Icone: History,
    tom: "uva",
  },
  {
    href: "/familia",
    titulo: "Área da família",
    texto: "Perfis, rotina, relatório e assinatura — com o responsável.",
    Icone: Users,
    tom: "verde",
  },
];

export default function MeuEspacoPage() {
  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="uva">Tudo o que é seu</Etiqueta>}
        titulo="Meu espaço"
        apoio="Seus registros, seus percursos e o caminho até o responsável."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {DESTINOS.map(({ href, titulo, texto, Icone, tom }) => (
          <Link key={href} href={href} className="no-underline">
            <Chapa tom={tom} interativa className="h-full">
              <Icone size={30} strokeWidth={2.3} aria-hidden="true" className="text-tinta" />
              <h2 className="mt-3 font-display text-xl font-semibold text-tinta">{titulo}</h2>
              <p className="mt-1.5 text-sm text-tinta-suave">{texto}</p>
            </Chapa>
          </Link>
        ))}
      </div>
    </>
  );
}

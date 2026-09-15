import { BookOpen, History, NotebookPen, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SeletorTema } from "@/components/seletor-tema";
import { Chapa, type Tom } from "@/components/ui/chapa";
import { CabecalhoPagina, Etiqueta } from "@/components/ui/pagina";
import { countNotes, lastExamDate } from "@/features/learning/repository";
import { getCurrentUser } from "@/lib/auth";
import { currentDashboard } from "@/lib/view";

export const metadata: Metadata = { title: "Meu espaço" };

const dia = (date: Date) => date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/**
 * Hub dos destinos secundários. Existe para a barra inferior do celular
 * caber em cinco abas; no desktop o rail lateral já lista tudo direto.
 *
 * Cada cartão carrega um dado real do perfil atual. Um índice de quatro links
 * sem número não dá motivo para entrar em nenhum deles.
 */
export default async function MeuEspacoPage() {
  const data = await currentDashboard();
  const user = await getCurrentUser();
  const [descobertas, ultimoSimulado] =
    user && data.profile
      ? await Promise.all([
          countNotes(user.id, data.profile.id),
          lastExamDate(user.id, data.profile.id),
        ])
      : [0, null];
  const ultimoPercurso = data.recent[0];

  const destinos: {
    href: string;
    titulo: string;
    texto: string;
    dado: string;
    Icone: typeof BookOpen;
    tom: Tom;
  }[] = [
    {
      href: "/simulados",
      titulo: "Simulados",
      texto: "Percursos sem pistas, com a devolutiva toda no final.",
      dado: ultimoSimulado ? `Último em ${dia(ultimoSimulado)}` : "Nenhum ainda",
      Icone: BookOpen,
      tom: "ceu",
    },
    {
      href: "/caderno",
      titulo: "Meu caderno",
      texto: "Guarde suas estratégias e seus “ah, entendi!”.",
      dado:
        descobertas === 0
          ? "Nenhuma descoberta guardada"
          : descobertas === 1
            ? "1 descoberta guardada"
            : `${descobertas} descobertas guardadas`,
      Icone: NotebookPen,
      tom: "sol",
    },
    {
      href: "/historico",
      titulo: "Meu histórico",
      texto: "Tudo o que você já percorreu, para retomar ou rever.",
      dado: ultimoPercurso ? `Último em ${dia(ultimoPercurso.createdAt)}` : "Nenhum percurso ainda",
      Icone: History,
      tom: "uva",
    },
    {
      href: "/familia",
      titulo: "Área da família",
      texto: "Perfis, rotina, relatório e assinatura — com o responsável.",
      dado:
        data.profiles.length === 1
          ? "1 estudante nesta conta"
          : `${data.profiles.length} estudantes nesta conta`,
      Icone: Users,
      tom: "verde",
    },
  ];

  return (
    <>
      <CabecalhoPagina
        etiqueta={<Etiqueta tom="uva">Tudo o que é seu</Etiqueta>}
        titulo="Meu espaço"
        apoio="Seus registros, seus percursos e o caminho até o responsável."
      />
      <div className="mb-6 rounded-card border-2 border-sombra bg-creme p-5 shadow-chapa">
        <SeletorTema />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {destinos.map(({ href, titulo, texto, dado, Icone, tom }) => (
          <Link key={href} href={href} className="no-underline">
            <Chapa tom={tom} interativa className="flex h-full flex-col">
              <Icone size={30} strokeWidth={2.3} aria-hidden="true" className="text-tinta" />
              <h2 className="mt-3 font-display text-xl font-semibold text-tinta">{titulo}</h2>
              <p className="mt-1.5 text-sm text-tinta-suave">{texto}</p>
              <p className="mt-auto pt-3 font-display text-sm font-semibold text-tinta">{dado}</p>
            </Chapa>
          </Link>
        ))}
      </div>
    </>
  );
}

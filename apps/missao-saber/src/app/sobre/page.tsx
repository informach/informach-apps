import { Brand } from "@/components/brand";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { catalogCourses, catalogGrades } from "@/features/content/catalog";
import { inventory } from "@/features/content/inventory";
import { gradeRangeSentence } from "@/features/family/school-year";
export const metadata = { title: "Sobre o projeto" };

export default function About() {
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b-2 border-sombra px-4 py-4 sm:px-8">
        <Brand />
        <a
          href="/"
          className="font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta"
        >
          Início
        </a>
      </header>
      <main id="conteudo" className="prosa">
        <span className="eyebrow">NOSSO JEITO DE APRENDER</span>
        <h1>Uma descoberta por dia.</h1>
        <p>
          Missão Saber é um produto Informach de preparação independente para desafios escolares. O
          app atende {gradeRangeSentence(catalogGrades)}, com {catalogCourses.length} trilhas de
          educação financeira, matemática e raciocínio inspiradas nas competências da OBMEP, da
          OBMEP Mirim, do Canguru e da OLITEF.
        </p>
        <h2>O hábito abre espaço para pensar</h2>
        <p>
          Missões curtas combinam problemas autorais, pistas graduais e explicações. Laboratórios
          permitem modificar barras, malhas e grupos. Desafios mais longos convidam o estudante a
          justificar uma ideia com suas palavras.
        </p>
        <h2>Autonomia é uma evidência, não um rótulo</h2>
        <p>
          O diagnóstico orienta o caminho, sem atribuir domínio. O acompanhamento distingue
          tentativas com ajuda, primeiras respostas e estratégias repetidas. Acertar a mesma questão
          várias vezes não é evidência de transferência. As revisões são agendadas em intervalos de
          1, 3, 7, 14 e 30 dias, conforme encontros posteriores.
        </p>
        <h2>Uma biblioteca autoral e transparente</h2>
        <p>
          A biblioteca tem {inventory.totals.missions} missões, {inventory.totals.teachingItems}{" "}
          atividades de ensino e prática e {inventory.totals.reservedItems} atividades reservadas a
          diagnósticos e simulados. Habilidades de base são compartilhadas entre trilhas. O uso em
          família orienta correções e melhorias do produto. Não anunciamos eficácia validada, nota
          oficial ou garantia de medalha.
        </p>
        <h2>Autoria e referências</h2>
        <p>
          Materiais oficiais foram catalogados para estudar competências, formatos e níveis de
          dificuldade. Eles não integram o conteúdo publicado do app. Os organizadores das
          olimpíadas não são parceiros nem responsáveis pelo Missão Saber.
        </p>
        <LinkChapa href="/experimentar" medida="g" className="not-prose mt-4">
          Experimentar uma missão
        </LinkChapa>
      </main>
    </>
  );
}

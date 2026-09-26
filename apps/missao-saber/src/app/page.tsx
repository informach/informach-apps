import { PRODUCTS } from "@informach/config";
import { ArrowUpRight, Check, Compass, Lightbulb, Sprout } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Mascote } from "@/components/mascote";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { Horizonte, tomDoCurso } from "@/components/ui/horizonte";
import { Etiqueta } from "@/components/ui/pagina";
import { catalogGrades, courses } from "@/features/content/catalog";
import { inventory } from "@/features/content/inventory";
import { gradeRangeLabel } from "@/features/family/school-year";

export const metadata = {
  title: { absolute: "Missão Saber · Uma descoberta por dia" },
  description:
    "Matemática e educação financeira em missões autorais para o 6º e 7º ano. A primeira unidade é gratuita, sem cartão.",
};

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const planos = ["individual", "family"].map((tier) => ({
  tier,
  monthly: PRODUCTS.find(
    (p) => p.app === "missao-saber" && p.tier === tier && p.interval === "month",
  ),
  annual: PRODUCTS.find(
    (p) => p.app === "missao-saber" && p.tier === tier && p.interval === "year",
  ),
}));
const perguntas = [
  {
    pergunta: "Precisa de cartão para começar?",
    resposta:
      "Não. A missão de demonstração dispensa cadastro, e a conta gratuita inclui a unidade de frações, o diagnóstico e os laboratórios.",
  },
  {
    pergunta: "Para qual ano escolar é o app hoje?",
    resposta:
      "Para o 6º e o 7º ano, com trilhas ligadas a OLITEF, Canguru e OBMEP. Os outros anos entram por etapas, e o perfil do estudante mostra as trilhas do ano dele.",
  },
  {
    pergunta: "Como acompanho meu filho?",
    resposta:
      "A área da família mostra o que cada estudante percorreu, onde pediu pista e o que repetiu. Quem quiser recebe um resumo semanal por e-mail, sem lembretes para a criança.",
  },
  {
    pergunta: "Posso cancelar quando quiser?",
    resposta:
      "Sim, pelo portal seguro de cobrança, a qualquer momento. O histórico do estudante fica guardado e a unidade gratuita continua aberta.",
  },
];

/* Página de venda: quem lê é o responsável. Registro adulto e calmo,
   mas mostrando a linguagem visual que a criança vai encontrar dentro. */

export default function Home() {
  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Brand />
        <nav aria-label="Navegação pública" className="flex items-center gap-5">
          <a
            href="#trilhas"
            className="font-semibold text-tinta-suave underline-offset-4 hover:underline max-sm:hidden"
          >
            As trilhas
          </a>
          <a
            href="#como"
            className="font-semibold text-tinta-suave underline-offset-4 hover:underline max-sm:hidden"
          >
            Como funciona
          </a>
          <a
            href="#planos"
            className="font-semibold text-tinta-suave underline-offset-4 hover:underline max-sm:hidden"
          >
            Planos
          </a>
          <LinkChapa href="/entrar" tom="contorno" medida="p">
            Entrar <ArrowUpRight size={16} aria-hidden="true" />
          </LinkChapa>
        </nav>
      </header>

      <main id="conteudo">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div>
            <Etiqueta tom="lima">
              <Sprout size={14} aria-hidden="true" /> Para mentes que gostam de descobrir
            </Etiqueta>
            <h1 className="mt-4 font-display text-4xl leading-[1.08] font-semibold text-tinta sm:text-5xl lg:text-6xl">
              Uma descoberta.
              <br />
              Um novo jeito
              <br />
              <span className="text-verde">de pensar.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-tinta-suave">
              Matemática e educação financeira em pequenas missões. Para ganhar confiança nos
              desafios do 6º e 7º ano, e levar o raciocínio além da prova.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <LinkChapa href="/experimentar" medida="g">
                Experimentar uma missão <ArrowUpRight size={20} aria-hidden="true" />
              </LinkChapa>
              <LinkChapa href="/entrar" tom="contorno" medida="g">
                Criar conta gratuita
              </LinkChapa>
            </div>
            <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-tinta-suave">
              <Check size={15} aria-hidden="true" /> Sem cadastro para experimentar · Conteúdo
              autoral
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="rounded-heroi border-2 border-verde/30 bg-verde-claro p-6 text-center shadow-[0_6px_0_color-mix(in_oklab,var(--ms-verde)_28%,transparent)]">
              <Mascote humor="acolhendo" tamanho="g" className="mx-auto" />
              <p className="mt-3 font-display text-lg font-semibold text-tinta">
                “Ah, agora entendi!”
              </p>
              <p className="text-sm text-tinta-suave">O melhor tipo de conquista.</p>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <span className="rounded-full border-2 border-sombra bg-creme px-4 py-2 font-display text-sm font-semibold text-tinta shadow-chapa-sm">
                ½ + uma nova perspectiva
              </span>
              <span className="rounded-full border-2 border-lima-fundo/40 bg-lima/40 px-4 py-2 font-display text-sm font-semibold text-tinta">
                curiosidade + prática
              </span>
            </div>
          </div>
        </section>

        <div className="border-y-2 border-sombra bg-creme">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 sm:px-8">
            <span className="font-display text-sm font-semibold tracking-wide text-tinta-suave uppercase">
              Feito para entender
            </span>
            {[
              [Lightbulb, "Pistas que ajudam a pensar"],
              [Compass, "Um caminho no seu ritmo"],
              [Sprout, "Aprender sem medo de errar"],
            ].map(([Icone, texto]) => {
              const I = Icone as typeof Lightbulb;
              return (
                <span key={texto as string} className="inline-flex items-center gap-2 text-tinta">
                  <I size={20} aria-hidden="true" className="text-verde" />
                  {texto as string}
                </span>
              );
            })}
          </div>
        </div>

        <section id="trilhas" className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Etiqueta tom="uva">Um ponto de partida, muitas descobertas</Etiqueta>
              <h2 className="mt-3 font-display text-3xl font-semibold text-tinta sm:text-4xl">
                Qual ideia vamos explorar?
              </h2>
            </div>
            <Etiqueta tom="creme">
              {inventory.totals.missions} missões · {gradeRangeLabel(catalogGrades)}
            </Etiqueta>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* O mesmo horizonte que a criança encontra na trilha: o responsável
                reconhece o lugar antes de assinar, e a criança reencontra o
                lugar depois de entrar. */}
            {courses.map((course) => (
              <Chapa
                key={course.id}
                tom={tomDoCurso(course)}
                className="relative flex flex-col overflow-hidden pb-16"
              >
                <Horizonte tom={tomDoCurso(course)} className="h-16 opacity-30 sm:h-16" />
                <span className="relative font-display text-xs font-semibold text-tinta-suave uppercase">
                  {course.label}
                </span>
                <h3 className="relative mt-1 font-display text-lg leading-snug font-semibold text-tinta">
                  {course.title}
                </h3>
                <p className="relative mt-1.5 text-sm text-tinta-suave">{course.description}</p>
                <span className="relative mt-auto pt-4 font-display text-sm font-semibold text-tinta">
                  {gradeRangeLabel(course.grades)}
                </span>
              </Chapa>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm text-tinta-suave">
            Preparação independente. Missão Saber não é afiliado às organizações das olimpíadas. O
            conteúdo publicado é autoral; nenhum resultado ou medalha é garantido.
          </p>
        </section>

        <section id="como" className="border-y-2 border-sombra bg-creme">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <Etiqueta tom="verde">O hábito encontra a compreensão</Etiqueta>
              <h2 className="mt-3 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
                Pequenas missões.
                <br />
                Ideias que ficam.
              </h2>
              <p className="mt-4 max-w-md text-tinta-suave">
                Uma rotina curta abre a porta. Explorar, explicar e reencontrar uma ideia é o que dá
                sentido ao caminho.
              </p>
              <Link
                href="/sobre"
                className="mt-4 inline-block font-semibold text-tinta underline underline-offset-4"
              >
                Conheça nosso jeito de aprender ↗
              </Link>
            </div>
            <div className="grid gap-4">
              {[
                [
                  "01",
                  "Experimente antes de decorar",
                  "Manipule barras, quadradinhos e grupos para enxergar o que uma conta representa.",
                ],
                [
                  "02",
                  "Encontre o porquê",
                  "Use pistas e explicações. O registro distingue uma resposta com apoio de uma tentativa sem pistas.",
                ],
                [
                  "03",
                  "Reencontre no tempo certo",
                  "Volte a uma habilidade em outros dias e contextos. Repetir a mesma resposta não certifica domínio.",
                ],
              ].map(([number, title, description]) => (
                <article
                  key={number}
                  className="flex gap-4 rounded-card border-2 border-sombra bg-papel p-5"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-lima font-display font-semibold text-tinta"
                  >
                    {number}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-tinta">{title}</h3>
                    <p className="mt-1 text-sm text-tinta-suave">{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-8 lg:grid-cols-2">
          <div>
            <Etiqueta tom="ceu">Para quem acompanha</Etiqueta>
            <h2 className="mt-3 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
              Veja o aprendizado.
              <br />
              Além do tempo de tela.
            </h2>
            <p className="mt-4 max-w-md text-tinta-suave">
              Perfis separados e um relatório com tentativas, uso de pistas e estratégias
              trabalhadas. Para apoiar o próximo passo com mais clareza.
            </p>
          </div>
          <Chapa tom="creme">
            <Etiqueta tom="creme">Exemplo ilustrativo de acompanhamento</Etiqueta>
            <h3 className="mt-3 font-display text-xl font-semibold text-tinta">
              Um caminho em construção
            </h3>
            <div className="mt-4 grid gap-3">
              {[
                [Check, "Novas estratégias resolvidas sem pistas", "text-verde"],
                [Lightbulb, "Ideias que ainda precisam de apoio", "text-sol-fundo"],
                [Compass, "Próximas habilidades para reencontrar", "text-uva"],
              ].map(([Icone, texto, cor]) => {
                const I = Icone as typeof Check;
                return (
                  <div key={texto as string} className="flex items-center gap-3 text-tinta">
                    <I size={20} aria-hidden="true" className={cor as string} />
                    <span className="text-sm">{texto as string}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-sm text-tinta-suave">Sem comparação pública entre crianças.</p>
          </Chapa>
        </section>

        <section id="planos" className="border-t-2 border-sombra bg-creme">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
            <div className="max-w-2xl">
              <Etiqueta tom="verde">Planos</Etiqueta>
              <h2 className="mt-3 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
                Comece de graça.
                <br />
                Assine quando fizer sentido.
              </h2>
              <p className="mt-4 text-tinta-suave">
                A unidade de frações, o diagnóstico e os laboratórios são gratuitos, sem cartão. A
                assinatura libera todas as trilhas, revisões, simulados e o relatório semanal da
                família.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {planos.map(({ tier, monthly, annual }) =>
                monthly && annual && monthly.listPrice && annual.listPrice ? (
                  <Chapa
                    key={tier}
                    tom={tier === "family" ? "lima" : "creme"}
                    className="flex flex-col"
                  >
                    <h3 className="font-display text-xl font-semibold text-tinta">
                      {tier === "family" ? "Família" : "Individual"}
                    </h3>
                    <p className="mt-1 text-sm text-tinta-suave">
                      {tier === "family" ? "Até três estudantes" : "Um estudante"}
                    </p>
                    <p className="mt-4 font-display text-4xl font-semibold text-tinta">
                      {brl(monthly.listPrice.amountCents)}
                      <span className="text-base font-normal text-tinta-suave">/mês</span>
                    </p>
                    <p className="mt-1 text-sm text-tinta-suave">
                      Ou {brl(annual.listPrice.amountCents)} por ano, cobrados de uma vez.
                    </p>
                    <ul className="mt-5 grid gap-2 text-sm text-tinta">
                      {[
                        "Todas as trilhas do ano escolar",
                        "Revisões espaçadas e simulados",
                        "Relatório da família e resumo semanal",
                        "Histórico preservado após cancelar",
                      ].map((linha) => (
                        <li key={linha} className="flex items-start gap-2">
                          <Check
                            size={18}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-verde"
                          />
                          {linha}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6">
                      <LinkChapa
                        href="/entrar"
                        medida="m"
                        tom={tier === "family" ? "verde" : "contorno"}
                      >
                        Criar conta e assinar
                      </LinkChapa>
                    </div>
                  </Chapa>
                ) : null,
              )}
            </div>
            <p className="mt-4 text-sm text-tinta-suave">
              Cancelamento a qualquer momento pelo portal seguro de cobrança. Sem anúncios e sem
              venda de dados.
            </p>
            <div className="mt-12 max-w-3xl">
              <h3 className="font-display text-2xl font-semibold text-tinta">
                Perguntas frequentes
              </h3>
              <div className="mt-4 grid gap-3">
                {perguntas.map(({ pergunta, resposta }) => (
                  <details
                    key={pergunta}
                    className="rounded-card border-2 border-sombra bg-papel p-4 open:shadow-chapa"
                  >
                    <summary className="cursor-pointer font-display font-semibold text-tinta">
                      {pergunta}
                    </summary>
                    <p className="mt-2 text-sm text-tinta-suave">{resposta}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t-2 border-sombra bg-verde-claro">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-8">
            <Etiqueta tom="verde">Curiosidade é um ótimo começo</Etiqueta>
            <h2 className="mt-4 font-display text-3xl leading-tight font-semibold text-tinta sm:text-4xl">
              A próxima descoberta
              <br />
              pode começar agora.
            </h2>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <LinkChapa href="/experimentar" medida="g">
                Quero experimentar <ArrowUpRight size={20} aria-hidden="true" />
              </LinkChapa>
              <LinkChapa href="/entrar" tom="contorno" medida="g">
                Criar conta do responsável
              </LinkChapa>
            </div>
            <p className="mt-4 text-sm text-tinta-suave">
              Uma missão gratuita, sem cadastro ou cartão.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-sombra px-4 py-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5">
          <Brand />
          <p className="text-sm text-tinta-suave">
            Um produto Informach. Conteúdo autoral para aprender a pensar.
          </p>
          <nav aria-label="Informações" className="flex flex-wrap gap-5 text-sm font-semibold">
            <Link href="/privacidade" className="underline underline-offset-4">
              Privacidade
            </Link>
            <Link href="/termos" className="underline underline-offset-4">
              Termos
            </Link>
            <Link href="/sobre" className="underline underline-offset-4">
              Sobre o projeto
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

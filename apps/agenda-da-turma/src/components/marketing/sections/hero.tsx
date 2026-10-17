import { Share2 } from "lucide-react";
import styles from "../sales.module.css";
import { SalesCta, TrialNote } from "../sales-cta";

const POSTER = [
  { subject: "Português", date: "22/10", topic: "interpretação", dot: "bg-chart-2" },
  { subject: "Matemática", date: "27/10", topic: "tabuada", dot: "bg-chart-1" },
  { subject: "Ciências", date: "29/10", topic: "ciclo da água", dot: "bg-chart-3" },
  { subject: "Inglês", date: "30/10", topic: "unit 4", dot: "bg-chart-5" },
];

const TODAY = [
  {
    title: "Enviar autorização do passeio",
    meta: "Autorização · Clara",
    chip: "Passou",
    tone: "late",
  },
  { title: "Páginas 32 e 33 do livro", meta: "Matemática · Clara", chip: "Hoje", tone: "today" },
  {
    title: "Exercícios 1 a 10 da apostila",
    meta: "Matemática · Miguel",
    chip: "Hoje",
    tone: "today",
  },
] as const;

/**
 * O que chega e o que vira: o cartaz de provas e a mensagem do grupo à
 * esquerda, a página do dia no celular à direita. São telas desenhadas para
 * explicar, com nomes de exemplo, e não fotos do app de alguém.
 */
function HeroVisual() {
  return (
    <div className="relative mx-auto grid w-full max-w-[560px] gap-4 sm:grid-cols-[1fr_1fr] sm:items-start">
      <div className="space-y-4">
        <figure className="rotate-[-1.5deg] rounded-2xl border border-foreground/15 bg-chart-4/10 p-4">
          <figcaption className="text-[13px] font-extrabold uppercase tracking-wider">
            Avaliações · 3º ano B
          </figcaption>
          <ul className="mt-2 space-y-1.5 font-mono text-[13px]">
            {POSTER.map((row) => (
              <li key={row.subject}>
                {row.subject} · {row.date} · {row.topic}
              </li>
            ))}
          </ul>
        </figure>
        <figure className="rounded-2xl border border-foreground/15 bg-background p-4">
          <figcaption className="text-[13px] font-bold text-muted-foreground">
            Grupo das famílias · 3º B
          </figcaption>
          <p className="mt-2 rounded-xl rounded-tl-sm bg-chart-2/15 px-3 py-2 text-[14px] leading-snug">
            O passeio ao museu é quarta, às 8h. Autorização assinada até terça!
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold">
            <Share2 className="size-4" aria-hidden />
            Compartilhar com a Agenda
          </p>
        </figure>
      </div>
      <figure
        aria-label="A página do dia no celular, com dados de exemplo"
        className="rounded-[28px] border-[6px] border-foreground bg-background p-3 shadow-solid"
      >
        <p className="text-[12px] font-semibold text-muted-foreground">Bom dia, Ana</p>
        <p className="text-[22px] font-extrabold leading-tight tracking-tight">Segunda, 19</p>
        <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
          Três coisas para hoje e uma que passou do prazo.
        </p>
        <div className="mt-2.5 overflow-hidden rounded-2xl border border-foreground/15">
          <p className="flex items-baseline justify-between px-3 pb-1 pt-2.5 text-[15px] font-extrabold">
            Para hoje <span className="text-[12px] font-bold text-muted-foreground">4</span>
          </p>
          <ul>
            {TODAY.map((item) => (
              <li
                key={item.title}
                className="flex items-start gap-2 border-t border-foreground/15 px-3 py-2"
              >
                <span
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-foreground/40"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-bold leading-snug">{item.title}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.meta}</span>
                </span>
                <span
                  className={
                    item.tone === "late"
                      ? "rounded-full bg-destructive/15 px-2 py-0.5 text-[10.5px] font-bold text-destructive-ink"
                      : "rounded-full bg-foreground px-2 py-0.5 text-[10.5px] font-bold text-background"
                  }
                >
                  {item.chip}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-2.5 rounded-2xl border border-foreground/15 px-3 py-2.5">
          <p className="text-[14px] font-extrabold">Amanhã, terça</p>
          <p className="text-[12px] text-muted-foreground">
            Rolo de papel e cola, e a touca da natação
          </p>
        </div>
      </figure>
    </div>
  );
}

const CHANNELS = ["grupo do WhatsApp", "Teams", "Batista ID", "agenda de papel", "cartaz em PDF"];

export function Hero() {
  return (
    <>
      <section
        aria-labelledby="hero-title"
        className={[
          styles.wrap,
          "grid gap-10 pb-14 pt-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-12",
        ].join(" ")}
      >
        <div className="space-y-5">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
            Para famílias com filhos do 1º ao 9º ano
          </p>
          <h1
            id="hero-title"
            className="text-balance text-[40px] font-extrabold leading-[1.05] tracking-tight sm:text-[56px]"
          >
            A rotina da escola não precisa morar na sua{" "}
            <em className="not-italic text-primary-ink">cabeça.</em>
          </h1>
          <p className="max-w-[34rem] text-[17px] leading-relaxed text-foreground/85">
            Chegou recado no grupo, tem foto da agenda na galeria, veio o cartaz de provas? Mande do
            jeito que chegou. A Agenda separa o que é para fazer, até quando e o que vai na mochila,
            e você confere antes de salvar.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <SalesCta placement="hero" />
            <a
              href="#demonstracao"
              className="inline-flex min-h-11 items-center font-bold text-primary-ink underline-offset-4 hover:underline"
            >
              Fazer o teste aqui
            </a>
          </div>
          <TrialNote />
        </div>
        <HeroVisual />
      </section>
      <div className="border-y border-foreground/15 bg-muted/40">
        <div
          className={[styles.wrap, "flex flex-wrap items-center gap-x-4 gap-y-3 py-5"].join(" ")}
        >
          <p className="text-[15px] font-bold">
            A escola não precisa mudar nada. O recado vem de onde já vem:
          </p>
          <ul className="flex flex-wrap gap-2">
            {CHANNELS.map((channel) => (
              <li
                key={channel}
                className="rounded-full border border-foreground/15 bg-background px-3 py-1 text-sm font-semibold"
              >
                {channel}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

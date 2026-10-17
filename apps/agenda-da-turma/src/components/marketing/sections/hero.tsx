import { cn } from "@informach/ui/lib/utils";
import { BackpackIcon, ShareIcon } from "@/components/icons/canvas-icons";
import {
  CHECK,
  CHIP,
  DOT,
  EYEBROW,
  GRID2,
  LEAD,
  META,
  Phone,
  ROW,
  SHEET,
  WRAP,
} from "../landing-ui";
import { SalesCta, TrialNote } from "../sales-cta";

const POSTER = [
  "Português · 22/10 · interpretação",
  "Matemática · 27/10 · tabuada",
  "Ciências · 29/10 · ciclo da água",
  "Inglês · 30/10 · unit 4",
];

const TODAY = [
  {
    title: "Enviar autorização do passeio",
    meta: "Autorização · Clara",
    dot: null,
    chip: "Passou",
    tone: "bg-destructive/14 text-destructive-ink",
  },
  {
    title: "Páginas 32 e 33 do livro",
    meta: "Matemática · Clara",
    dot: "bg-chart-1",
    chip: "Hoje",
    tone: "bg-foreground text-background",
  },
  {
    title: "Exercícios 1 a 10 da apostila",
    meta: "Matemática · Miguel",
    dot: "bg-chart-1",
    chip: "Hoje",
    tone: "bg-foreground text-background",
  },
];

/**
 * O que chega e o que vira, como na prancha: o cartaz de provas escrito à mão,
 * a mensagem do grupo e o "Compartilhar com a Agenda" à esquerda, e a página
 * do dia no celular à direita. No celular a cena inteira encolhe (`zoom`),
 * como no canvas, em vez de se rearrumar.
 */
function HeroArt() {
  return (
    <div
      role="img"
      aria-label="Um cartaz de provas virando a página do dia no celular"
      className="relative mx-auto h-[640px] w-[540px] max-[760px]:[zoom:0.64] max-[380px]:[zoom:0.5]"
    >
      <div className="absolute left-0 top-10 w-[270px] -rotate-[5deg] rounded-md border border-foreground/15 bg-background px-5 pb-6 pt-[22px] text-sm leading-normal shadow-[0_14px_30px_-12px_color-mix(in_oklch,var(--foreground)_30%,transparent)]">
        <div className="absolute -top-3 left-[100px] h-6 w-[76px] rotate-[3deg] rounded-sm bg-chart-4/30" />
        <div className="mb-2.5 text-[15px] font-extrabold">Avaliações · 3º ano B</div>
        <div className="flex flex-col gap-1 font-[family-name:var(--font-caveat)] text-[22px] leading-[1.25] text-foreground/90">
          {POSTER.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </div>
      <div className="absolute left-[18px] top-[330px] w-[250px] rounded-[18px] rounded-bl-[4px] border border-foreground/15 bg-background px-4 py-3.5 shadow-[0_10px_24px_-14px_color-mix(in_oklch,var(--foreground)_35%,transparent)]">
        <div className="mb-1 text-xs font-extrabold text-chart-2-ink">
          Grupo das famílias · 3º B
        </div>
        <div className="text-sm leading-[1.45]">
          O passeio ao museu é quarta, às 8h. Autorização assinada até terça!
        </div>
      </div>
      <div className="absolute left-[150px] top-[470px] flex items-center gap-2 rounded-full border border-foreground/15 bg-background px-3.5 py-2 text-sm font-bold text-primary-ink">
        <ShareIcon className="size-[18px]" strokeWidth={2.2} />
        Compartilhar com a Agenda
      </div>
      <Phone className="absolute right-0 top-0">
        <div className="flex flex-col gap-1.5 px-5 pt-[22px]">
          <span className="text-[15px] text-muted-foreground">Bom dia, Ana</span>
          <span className="text-[44px] font-extrabold leading-none tracking-[-0.045em]">
            Segunda, 19
          </span>
          <span className="mt-1 text-base leading-[1.45] text-foreground/80">
            Três coisas para hoje e uma que passou do prazo.
          </span>
        </div>
        <div className="px-4 pt-[18px]">
          <div className={cn(SHEET, "overflow-hidden rounded-[18px]")}>
            <div className="flex items-center justify-between px-4 py-3.5">
              <b className="text-[19px]">Para hoje</b>
              <span className="text-sm text-muted-foreground">4</span>
            </div>
            {TODAY.map((item) => (
              <div key={item.title} className={ROW}>
                <span className={CHECK} />
                <div className="min-w-0 flex-1">
                  <b className="text-base">{item.title}</b>
                  <div className={META}>
                    {item.dot ? <span className={`${DOT} ${item.dot}`} /> : null}
                    {item.meta}
                  </div>
                </div>
                <span className={`${CHIP} ${item.tone}`}>{item.chip}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-4 pt-3.5">
          <div className={cn(SHEET, "flex flex-col gap-2.5 rounded-[18px] px-4 py-3.5")}>
            <b className="text-[19px]">Amanhã, terça</b>
            <div className="flex items-center gap-2.5 text-[15px]">
              <BackpackIcon className="size-5 shrink-0" />
              <span>Rolo de papel e cola, e a touca da natação</span>
            </div>
          </div>
        </div>
      </Phone>
    </div>
  );
}

const CHANNELS = ["grupo do WhatsApp", "Teams", "Batista ID", "agenda de papel", "cartaz em PDF"];

export function Hero() {
  return (
    <>
      <section aria-labelledby="hero-title" className="pb-14 pt-[72px]">
        <div className={`${WRAP} ${GRID2}`}>
          <div className="flex flex-col gap-[26px]">
            <p className={EYEBROW}>Para famílias com filhos do 1º ao 9º ano</p>
            <h1
              id="hero-title"
              className="m-0 text-balance text-[46px] font-extrabold leading-[0.98] tracking-[-0.05em] min-[761px]:text-[clamp(46px,6vw,82px)]"
            >
              A rotina da escola não precisa morar na sua{" "}
              <span className="text-primary">cabeça.</span>
            </h1>
            <p className={LEAD}>
              Chegou recado no grupo, tem foto da agenda na galeria, veio o cartaz de provas? Mande
              do jeito que chegou. A Agenda separa o que é para fazer, até quando e o que vai na
              mochila, e você confere antes de salvar.
            </p>
            <div className="flex flex-wrap items-center gap-3.5">
              <SalesCta placement="hero" arrow />
              <a
                href="#demonstracao"
                className="px-1.5 py-3 text-base font-bold text-foreground underline hover:text-primary-ink"
              >
                Fazer o teste aqui
              </a>
            </div>
            <TrialNote />
          </div>
          <HeroArt />
        </div>
      </section>
      <section className="border-y border-foreground/15 bg-background">
        <div className={`${WRAP} flex flex-wrap items-center justify-between gap-5 py-[26px]`}>
          <p className="max-w-[560px] text-[17px] font-semibold leading-normal">
            A escola não precisa mudar nada. O recado vem de onde já vem:
          </p>
          <ul className="flex flex-wrap gap-2.5">
            {CHANNELS.map((channel) => (
              <li
                key={channel}
                className={cn(CHIP, "h-10 border border-foreground/15 px-4 text-[15px]")}
              >
                {channel}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

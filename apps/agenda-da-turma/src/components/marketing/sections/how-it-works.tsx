import { Camera, MessageSquareText, Mic, Pencil } from "lucide-react";
import { MAX_PHOTOS } from "@/features/notices/photo-pdf";
import styles from "../sales.module.css";

// Um ponto por matéria do dia, na cor dela, como na faixa da semana do app.
const WEEK = [
  { day: "seg", date: 19, dots: ["bg-chart-1", "bg-chart-2"] },
  { day: "ter", date: 20, dots: ["bg-chart-3"] },
  { day: "qua", date: 21, dots: ["bg-foreground"] },
  { day: "qui", date: 22, dots: ["bg-chart-2", "bg-chart-5", "bg-chart-1"], full: true },
  { day: "sex", date: 23, dots: ["bg-chart-4"] },
];

/**
 * Três passos, e cada um mostra o pedaço de tela que faz o que diz. A
 * explicação é sobre o que a família faz, não sobre a tecnologia.
 */
export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="how-title"
      className={[styles.wrap, "scroll-mt-6 py-16 md:py-24"].join(" ")}
    >
      <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
        Como funciona
      </p>
      <h2
        id="how-title"
        className="mt-3 max-w-[46rem] text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]"
      >
        Ler o recado é a parte fácil. Difícil é lembrar, na quarta à noite, que a autorização era
        até quinta.
      </h2>
      <ol className="mt-10 grid gap-5 md:grid-cols-3">
        <li className="space-y-3 rounded-[20px] border border-foreground/15 bg-background p-5">
          <p className="text-[13px] font-extrabold text-muted-foreground">1</p>
          <h3 className="text-xl font-extrabold tracking-tight">Mande do jeito que chegou</h3>
          <p className="text-[15px] leading-relaxed text-foreground/80">
            Tire foto da agenda ou do caderno, junte até {MAX_PHOTOS} páginas num recado só, cole a
            mensagem do grupo ou fale de mãos ocupadas. No Android, dá até para compartilhar direto
            do WhatsApp.
          </p>
          <ul className="grid grid-cols-2 gap-2 text-sm font-bold">
            {[
              { label: "Foto", icon: Camera },
              { label: "Mensagem", icon: MessageSquareText },
              { label: "Falar", icon: Mic },
              { label: "Escrever", icon: Pencil },
            ].map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="flex items-center gap-2 rounded-xl border border-foreground/15 px-3 py-2"
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </li>
        <li className="space-y-3 rounded-[20px] border border-foreground/15 bg-background p-5">
          <p className="text-[13px] font-extrabold text-muted-foreground">2</p>
          <h3 className="text-xl font-extrabold tracking-tight">Confira o que a Agenda entendeu</h3>
          <p className="text-[15px] leading-relaxed text-foreground/80">
            Cada matéria vira uma atividade, com o prazo de cada uma. Quando a escola não deu data,
            aparece “a confirmar”. A Agenda nunca inventa prazo.
          </p>
          <ul className="space-y-2 text-sm">
            <li className="rounded-xl border border-foreground/15 px-3 py-2">
              <span className="block font-bold">Prova de Português</span>
              <span className="text-muted-foreground">qui, 22 · a escola disse</span>
            </li>
            <li className="rounded-xl border border-dashed border-foreground/25 px-3 py-2">
              <span className="block font-bold">Separar boné e garrafa</span>
              <span className="text-muted-foreground">a confirmar · o recado não diz quando</span>
            </li>
          </ul>
        </li>
        <li className="space-y-3 rounded-[20px] border border-foreground/15 bg-background p-5">
          <p className="text-[13px] font-extrabold text-muted-foreground">3</p>
          <h3 className="text-xl font-extrabold tracking-tight">Abra uma vez por dia</h3>
          <p className="text-[15px] leading-relaxed text-foreground/80">
            Hoje, amanhã e a mochila numa tela só. O resto da semana fica logo abaixo, com o dia
            mais puxado avisado antes.
          </p>
          <ul className="grid grid-cols-5 gap-1.5" aria-label="Uma semana de exemplo">
            {WEEK.map((day) => (
              <li
                key={day.date}
                className={
                  day.full
                    ? "flex flex-col items-center rounded-xl bg-chart-4/20 py-2"
                    : "flex flex-col items-center rounded-xl border border-foreground/15 py-2"
                }
              >
                <span className="text-[11px] font-bold text-muted-foreground">{day.day}</span>
                <span className="text-[17px] font-extrabold">{day.date}</span>
                <span className="mt-1 flex gap-0.5" aria-hidden>
                  {day.dots.map((dot) => (
                    <span key={dot} className={`size-1.5 rounded-full ${dot}`} />
                  ))}
                </span>
                {day.full ? <span className="sr-only">(dia cheio)</span> : null}
              </li>
            ))}
          </ul>
        </li>
      </ol>
    </section>
  );
}

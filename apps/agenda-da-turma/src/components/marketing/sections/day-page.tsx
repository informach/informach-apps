import { Backpack } from "lucide-react";
import styles from "../sales.module.css";

const WEEK = [
  { day: "seg, 19", load: "3 coisas" },
  { day: "ter, 20", load: "material de Ciências" },
  { day: "qua, 21", load: "passeio ao museu" },
  { day: "qui, 22", load: "2 provas, cerca de 1 hora", full: true },
  { day: "sex, 23", load: "maquete de História" },
];

export function DayPage() {
  return (
    <section
      id="dia"
      aria-labelledby="day-title"
      className={[
        styles.wrap,
        "grid scroll-mt-6 gap-10 py-16 md:py-24 lg:grid-cols-2 lg:items-center",
      ].join(" ")}
    >
      <div className="space-y-4">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
          A página do dia
        </p>
        <h2
          id="day-title"
          className="text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]"
        >
          Uma olhada de manhã, outra à noite, e a semana se resolve.
        </h2>
        <p className="text-[16px] leading-relaxed text-foreground/80">
          De manhã, a Agenda mostra o que é para hoje e o que passou do prazo. À noite, a mochila de
          amanhã sobe para o topo, com o que cada matéria pede sempre: tênis na educação física,
          touca na natação, a apostila do reforço.
        </p>
        <p className="text-[16px] leading-relaxed text-foreground/80">
          No domingo chega um resumo da semana por e-mail, com o dia mais cheio marcado enquanto
          ainda dá para adiantar.
        </p>
        <p className="text-sm font-semibold text-muted-foreground">
          Resumos e lembretes fazem parte do Pro.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <figure className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background">
          <figcaption className="px-4 pt-4 text-[12px] font-bold text-muted-foreground">
            20h · segunda
          </figcaption>
          <p className="flex items-center gap-2 px-4 pb-2 text-lg font-extrabold">
            <Backpack className="size-5" aria-hidden />A mochila de amanhã
          </p>
          <ul>
            {[
              { kid: "Clara", classes: "Português e Ciências", bring: "Rolo de papel e cola" },
              {
                kid: "Miguel",
                classes: "Matemática, natação à tarde",
                bring: "Touca, óculos e toalha",
              },
            ].map((row) => (
              <li key={row.kid} className="border-t border-foreground/15 px-4 py-3 text-[14px]">
                <p className="font-bold">{row.kid}</p>
                <p className="text-muted-foreground">{row.classes}</p>
                <p className="font-semibold">Leva {row.bring.toLowerCase()}</p>
              </li>
            ))}
          </ul>
        </figure>
        <figure className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background">
          <figcaption className="px-4 pt-4 text-[12px] font-bold text-muted-foreground">
            Domingo, 18 · resumo da semana
          </figcaption>
          <p className="px-4 pb-2 text-lg font-extrabold">Quinta está cheia</p>
          <ul>
            {WEEK.map((row) => (
              <li
                key={row.day}
                className={
                  row.full
                    ? "grid grid-cols-[70px_1fr] gap-2 border-t border-foreground/15 bg-chart-4/10 px-4 py-2 text-[14px]"
                    : "grid grid-cols-[70px_1fr] gap-2 border-t border-foreground/15 px-4 py-2 text-[14px]"
                }
              >
                <span className="font-bold text-muted-foreground">{row.day}</span>
                <span className={row.full ? "font-bold" : undefined}>{row.load}</span>
              </li>
            ))}
          </ul>
        </figure>
      </div>
    </section>
  );
}

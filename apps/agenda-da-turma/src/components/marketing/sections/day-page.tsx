import { cn } from "@informach/ui/lib/utils";
import { EYEBROW, GRID2, H2, LEAD, META, Phone, SEC, SHEET, WRAP } from "../landing-ui";

const BACKPACK = [
  {
    kid: "Clara",
    initial: "C",
    tone: "bg-chart-4/25 border-chart-4/50",
    classes: "Português e Ciências",
    bring: "Rolo de papel e cola",
  },
  {
    kid: "Miguel",
    initial: "M",
    tone: "bg-chart-2/25 border-chart-2/50",
    classes: "Matemática, natação à tarde",
    bring: "Touca, óculos e toalha",
  },
];

const WEEK = [
  { day: "seg, 19", load: "3 coisas" },
  { day: "ter, 20", load: "material de Ciências" },
  { day: "qua, 21", load: "passeio ao museu" },
  { day: "qui, 22", load: "2 provas, cerca de 1 hora", full: true },
  { day: "sex, 23", load: "maquete de História" },
];

const SMALL_PHONE = "h-[520px] w-[250px] rounded-[38px] border-8";
const CELL = "flex items-center gap-3 border-t border-foreground/15 p-4";

/** A página do dia, como na prancha: a mochila da noite e o resumo de domingo, em dois celulares. */
export function DayPage() {
  return (
    <section id="dia" aria-labelledby="day-title" className={SEC}>
      <div className={`${WRAP} ${GRID2}`}>
        <div className="flex flex-col gap-[22px]">
          <p className={EYEBROW}>A página do dia</p>
          <h2 id="day-title" className={H2}>
            Uma olhada de manhã, outra à noite, e a semana se resolve.
          </h2>
          <p className={LEAD}>
            De manhã, a Agenda mostra o que é para hoje e o que passou do prazo. À noite, a mochila
            de amanhã sobe para o topo, com o que cada matéria pede sempre: tênis na educação
            física, touca na natação, a apostila do reforço.
          </p>
          <p className={LEAD}>
            No domingo chega um resumo da semana por e-mail, com o dia mais cheio marcado enquanto
            ainda dá para adiantar.
          </p>
          <p className="text-sm text-muted-foreground">Resumos e lembretes fazem parte do Pro.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-6">
          <Phone className={SMALL_PHONE} scale={0.6} label="A mochila de amanhã, à noite">
            <div className="px-5 pb-2.5 pt-6">
              <span className="text-[15px] text-muted-foreground">20h · segunda</span>
              <div className="mt-1.5 text-[40px] font-extrabold leading-[1.02] tracking-[-0.045em]">
                A mochila de amanhã
              </div>
            </div>
            <div className="px-4 py-2">
              <div className={cn(SHEET, "overflow-hidden rounded-[18px]")}>
                {BACKPACK.map((child, index) => (
                  <div key={child.kid}>
                    <div className={cn(CELL, index === 0 && "border-t-0")}>
                      <span
                        className={cn(
                          "flex size-[34px] items-center justify-center rounded-full border text-sm font-extrabold",
                          child.tone,
                        )}
                      >
                        {child.initial}
                      </span>
                      <div className="flex-1">
                        <b className="text-[17px]">{child.kid}</b>
                        <div className={META}>{child.classes}</div>
                      </div>
                    </div>
                    <div className="border-t border-foreground/15 py-3.5 pl-[62px] pr-4 text-base">
                      {child.bring}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Phone>
          <Phone
            className={cn(SMALL_PHONE, "mt-12")}
            scale={0.6}
            label="O resumo da semana, no domingo"
          >
            <div className="px-5 pb-2.5 pt-6">
              <span className="text-[15px] text-muted-foreground">
                Domingo, 18 · resumo da semana
              </span>
              <div className="mt-1.5 text-[40px] font-extrabold leading-[1.02] tracking-[-0.045em]">
                Quinta está cheia
              </div>
            </div>
            <div className="px-4 py-2">
              <div className={cn(SHEET, "overflow-hidden rounded-[18px]")}>
                {WEEK.map((row, index) => (
                  <div
                    key={row.day}
                    className={cn(CELL, index === 0 && "border-t-0", row.full && "bg-chart-4/10")}
                  >
                    <b className={cn("w-16 shrink-0", row.full && "text-chart-4-ink")}>{row.day}</b>
                    <span>{row.load}</span>
                  </div>
                ))}
              </div>
            </div>
          </Phone>
        </div>
      </div>
    </section>
  );
}

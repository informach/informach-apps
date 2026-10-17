import { cn } from "@informach/ui/lib/utils";
import { CameraIcon, MessageIcon, MicIcon, PencilIcon } from "@/components/icons/canvas-icons";
import { MAX_PHOTOS } from "@/features/notices/photo-pdf";
import { DOT, EYEBROW, GRID3, H2, META, ROW, SEC, SHEET, WRAP } from "../landing-ui";

const NUMBER_WORDS: Record<number, string> = { 2: "duas", 3: "três", 4: "quatro", 5: "cinco" };

const WAYS = [
  { label: "Foto", icon: CameraIcon, tile: "bg-chart-1/12" },
  { label: "Mensagem", icon: MessageIcon, tile: "bg-chart-2/12" },
  { label: "Falar", icon: MicIcon, tile: "bg-chart-3/12" },
  { label: "Escrever", icon: PencilIcon, tile: "bg-chart-4/12" },
];

const WEEK = [
  { day: "seg", date: 19, kind: "today" },
  { day: "ter", date: 20 },
  { day: "qua", date: 21 },
  { day: "qui", date: 22, kind: "full" },
  { day: "sex", date: 23 },
] as const;

const STEP = `${SHEET} flex flex-col gap-4 p-7`;
const NUMBER = "text-[15px] font-extrabold text-primary-ink";
const TITLE = "m-0 text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em]";
const TEXT = "text-base leading-[1.6] text-foreground/80";

/**
 * Três passos, e cada um mostra o pedaço de tela que faz o que diz, como na
 * prancha. A explicação é sobre o que a família faz, não sobre a tecnologia.
 */
export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="how-title" className={SEC}>
      <div className={`${WRAP} flex flex-col gap-12`}>
        <div className="flex max-w-[760px] flex-col gap-[18px]">
          <p className={EYEBROW}>Como funciona</p>
          <h2 id="how-title" className={H2}>
            Ler o recado é a parte fácil. Difícil é lembrar, na quarta à noite, que a autorização
            era até quinta.
          </h2>
        </div>
        <ol className={GRID3}>
          <li className={STEP}>
            <span className={NUMBER}>1</span>
            <h3 className={TITLE}>Mande do jeito que chegou</h3>
            <p className={TEXT}>
              Tire foto da agenda ou do caderno, junte até {NUMBER_WORDS[MAX_PHOTOS] ?? MAX_PHOTOS}{" "}
              páginas num recado só, cole a mensagem do grupo ou fale de mãos ocupadas. No Android,
              dá até para compartilhar direto do WhatsApp.
            </p>
            <ul className="mt-auto grid grid-cols-4 gap-2">
              {WAYS.map(({ label, icon: Icon, tile }) => (
                <li
                  key={label}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-[14px] px-1 py-3 text-xs font-bold",
                    tile,
                  )}
                >
                  <Icon className="size-[22px]" />
                  {label}
                </li>
              ))}
            </ul>
          </li>
          <li className={STEP}>
            <span className={NUMBER}>2</span>
            <h3 className={TITLE}>Confira o que a Agenda entendeu</h3>
            <p className={TEXT}>
              Cada matéria vira uma atividade, com o prazo de cada uma. Quando a escola não deu
              data, aparece “a confirmar”. A Agenda nunca inventa prazo.
            </p>
            <ul className="mt-auto overflow-hidden rounded-2xl border border-foreground/15 bg-background">
              <li className={cn(ROW, "border-t-0")}>
                <div className="flex-1">
                  <b className="text-[15px]">Prova de Português</b>
                  <div className={META}>
                    <span className={`${DOT} bg-chart-2`} />
                    qui, 22 · a escola disse
                  </div>
                </div>
              </li>
              <li className={ROW}>
                <div className="flex-1">
                  <b className="text-[15px]">Separar boné e garrafa</b>
                  <div className={META}>a confirmar · o recado não diz quando</div>
                </div>
              </li>
            </ul>
          </li>
          <li className={STEP}>
            <span className={NUMBER}>3</span>
            <h3 className={TITLE}>Abra uma vez por dia</h3>
            <p className={TEXT}>
              Hoje, amanhã e a mochila numa tela só. O resto da semana fica logo abaixo, com o dia
              mais puxado avisado antes.
            </p>
            <ul
              aria-label="Uma semana de exemplo"
              className="mt-auto grid grid-cols-5 gap-1.5 text-center"
            >
              {WEEK.map((day) => (
                <li
                  key={day.date}
                  className={cn(
                    "rounded-xl py-2.5 text-xs font-bold",
                    "kind" in day && day.kind === "today"
                      ? "bg-foreground text-background"
                      : "kind" in day && day.kind === "full"
                        ? "border-2 border-chart-4 text-chart-4-ink"
                        : "border border-foreground/15",
                  )}
                >
                  {day.day}
                  <br />
                  <b className="text-xl">{day.date}</b>
                  {"kind" in day && day.kind === "full" ? (
                    <span className="sr-only"> (dia cheio)</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        </ol>
      </div>
    </section>
  );
}

"use client";

import { cn } from "@informach/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { addDaysIso } from "@/features/dashboard/date";
import {
  addSchoolDaysIso,
  formatClockTime,
  shortDayLabel,
  weekdayLong,
} from "@/features/dashboard/day-labels";
import type { LandingScenario } from "@/features/metrics/landing-schema";
import {
  BTN,
  BTN2,
  CHIP,
  DOT,
  EYEBROW,
  GRID2,
  H2,
  META,
  SEC,
  SEC_LIGHT,
  SHEET,
  WRAP,
} from "../landing-ui";
import { SalesCta } from "../sales-cta";

type DemoItem = {
  id: string;
  title: string;
  subject: string;
  dot: string;
  /** Dias de aula a partir de hoje; `null` quando o recado não deu data. */
  offset: number | null;
  time?: string;
  /** O recado não deu data, mas o evento tem: planejar para a véspera dele. */
  planFor?: string;
  warn?: string;
};
type Scenario = {
  label: string;
  source: string;
  paperTitle: string;
  /** As linhas do recado, com as datas como a escola escreve. */
  lines: (dates: { ddmm: (offset: number) => string; day: (offset: number) => string }) => string[];
  items: DemoItem[];
};

const KID = "Clara";

/**
 * Os três recados da prancha. As datas andam com o dia de hoje, contadas em
 * dias de aula: a escola marca prova em dia de aula, e contar em dias corridos
 * punha prova no domingo.
 */
const SCENARIOS: Partial<Record<LandingScenario, Scenario>> = {
  cartaz: {
    label: "Cartaz de provas",
    source: "foto do cartaz",
    paperTitle: "Calendário de avaliações · 3º ano B",
    lines: ({ ddmm }) => [
      `Português · ${ddmm(3)} · interpretação de texto`,
      `Matemática · ${ddmm(6)} · tabuada do 6 e do 7`,
      `Ciências · ${ddmm(8)} · ciclo da água`,
      `Inglês · ${ddmm(9)} · unit 4`,
    ],
    items: [
      { id: "pt", title: "Prova de Português", subject: "Português", dot: "bg-chart-2", offset: 3 },
      {
        id: "mat",
        title: "Prova de Matemática",
        subject: "Matemática",
        dot: "bg-chart-1",
        offset: 6,
      },
      { id: "cie", title: "Prova de Ciências", subject: "Ciências", dot: "bg-chart-3", offset: 8 },
      {
        id: "ing",
        title: "Prova de Inglês",
        subject: "Inglês",
        dot: "bg-chart-5",
        offset: 9,
        warn: `Inglês não está nas matérias da ${KID}. Confira a matéria antes de salvar.`,
      },
    ],
  },
  passeio: {
    label: "Passeio",
    source: "grupo do WhatsApp",
    paperTitle: "Mensagem no grupo das famílias do 3º B",
    lines: ({ day }) => [
      `O passeio ao museu é ${day(2)}, às 8h, com saída no portão principal.`,
      `Mandem a autorização assinada até ${day(1)}.`,
      "Cada criança leva boné e garrafa de água.",
    ],
    items: [
      {
        id: "aut",
        title: "Enviar autorização do passeio",
        subject: "Autorização",
        dot: "bg-foreground",
        offset: 1,
      },
      {
        id: "bone",
        title: "Separar boné e garrafa",
        subject: "Material",
        dot: "bg-foreground",
        offset: null,
        planFor: "passeio",
      },
      {
        id: "passeio",
        title: "Passeio ao museu",
        subject: "Evento · saída no portão principal",
        dot: "bg-foreground",
        offset: 2,
        time: "08:00",
      },
    ],
  },
  material: {
    label: "Lista de material",
    source: "foto da agenda",
    paperTitle: `Bilhete colado na agenda da ${KID}`,
    lines: ({ day }) => [
      `Para a aula de Artes de ${day(4)}, cada criança deve trazer:`,
      "uma caixa de sapato, cola branca e papéis coloridos.",
    ],
    items: [
      {
        id: "artes",
        title: "Levar o material de Artes",
        subject: "Artes · caixa de sapato, cola branca e papéis coloridos",
        dot: "bg-chart-4",
        offset: 4,
      },
    ],
  },
};
const ORDER: LandingScenario[] = ["cartaz", "passeio", "material"];

function ddmmOf(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function DemoReview({ scenario, todayIso }: { scenario: LandingScenario; todayIso: string }) {
  const data = SCENARIOS[scenario] as Scenario;
  const [removed, setRemoved] = useState<string[]>([]);
  const [planned, setPlanned] = useState(false);
  const [saved, setSaved] = useState(false);
  // Salvar e recomeçar trocam o bloco inteiro, e o botão tocado some com ele:
  // o foco vai para o título do que apareceu, e não para o começo da página.
  const savedTitle = useRef<HTMLElement>(null);
  const reviewTitle = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    (saved ? savedTitle : reviewTitle).current?.focus();
  }, [saved]);
  const day = (offset: number) => addSchoolDaysIso(todayIso, offset);
  // A véspera é o dia anterior no calendário: separar o boné é coisa de casa.
  const planTarget = data.items.find((item) => item.id === "passeio");
  const plannedIso = planTarget?.offset ? addDaysIso(day(planTarget.offset), -1) : null;

  const resolved = data.items.map((item) => {
    const iso =
      item.offset !== null ? day(item.offset) : item.planFor && planned ? plannedIso : null;
    const origin =
      item.offset !== null
        ? "a escola disse"
        : item.planFor && planned
          ? "planejado por vocês"
          : "o recado não diz quando";
    return { ...item, iso, origin, off: removed.includes(item.id) };
  });
  const kept = resolved.filter((item) => !item.off);
  const count = kept.length;

  if (saved) {
    return (
      <>
        <div className="flex flex-col gap-1.5 px-[22px] pb-2.5 pt-[22px]" role="status">
          <span className={`${CHIP} self-start bg-chart-2/16 text-chart-2-ink`}>
            Salvo na semana da {KID}
          </span>
          <b ref={savedTitle} tabIndex={-1} className="text-[22px] tracking-[-0.01em] outline-none">
            Assim fica a semana.
          </b>
        </div>
        <ul>
          {kept.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 border-t border-foreground/15 px-[22px] py-3.5"
            >
              <span className="w-[72px] shrink-0 text-sm font-extrabold">
                {item.iso ? shortDayLabel(item.iso, todayIso) : "sem data"}
              </span>
              <div className="min-w-0 flex-1">
                <b className="text-base">{item.title}</b>
                <div className={META}>
                  <span className={`${DOT} ${item.dot}`} />
                  {item.subject}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/15 px-[22px] pb-[22px] pt-[18px]">
          <button
            type="button"
            className={cn(BTN2, "min-h-[46px]")}
            onClick={() => {
              setSaved(false);
              setRemoved([]);
              setPlanned(false);
            }}
          >
            Recomeçar o teste
          </button>
          <SalesCta placement="demo" label="Fazer com um recado meu" className="min-h-[50px]" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5 px-[22px] pb-3.5 pt-[22px]">
        <b ref={reviewTitle} tabIndex={-1} className="text-[22px] tracking-[-0.01em] outline-none">
          A Agenda achou {data.items.length} {data.items.length === 1 ? "atividade" : "atividades"}{" "}
          para a {KID}
        </b>
        <span className="text-[15px] text-muted-foreground">
          Confira as datas. O que a escola não disse fica a confirmar.
        </span>
      </div>
      <ul>
        {resolved.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-3 border-t border-foreground/15 px-[22px] py-4"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <b
                className={cn(
                  "text-[17px]",
                  item.off ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {item.title}
              </b>
              <div className={cn(META, "mt-0")}>
                <span className={`${DOT} ${item.dot}`} />
                <span>{item.subject}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    CHIP,
                    !item.iso
                      ? "border-[1.5px] border-dashed border-muted-foreground text-foreground/80"
                      : item.planFor && planned
                        ? "bg-chart-4/16 text-chart-4-ink"
                        : "border border-foreground/15",
                  )}
                >
                  {item.iso
                    ? `${shortDayLabel(item.iso, todayIso)}${item.time ? ` · ${formatClockTime(item.time)}` : ""}`
                    : "a confirmar"}
                </span>
                <span className="text-[13px] font-semibold text-foreground/75">{item.origin}</span>
              </div>
              {item.warn && !item.off ? (
                <span className="text-[13px] font-semibold leading-[1.45] text-chart-4-ink">
                  {item.warn}
                </span>
              ) : null}
              {item.planFor && !planned && !item.off ? (
                <button
                  type="button"
                  className="min-h-10 relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] self-start rounded-[10px] border border-foreground/15 bg-background px-3.5 text-sm font-bold hover:bg-muted"
                  data-landing-action="plan"
                  data-landing-scenario={scenario}
                  onClick={() => setPlanned(true)}
                >
                  Planejar para a véspera
                </button>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={`${item.off ? "Manter" : "Tirar"}: ${item.title}`}
              className={cn(
                "inline-flex min-h-11 min-w-[72px] shrink-0 items-center justify-center rounded-xl px-3 text-sm font-bold",
                item.off
                  ? "bg-foreground text-background"
                  : "border border-foreground/20 hover:bg-muted",
              )}
              onClick={() =>
                setRemoved((current) =>
                  current.includes(item.id)
                    ? current.filter((id) => id !== item.id)
                    : [...current, item.id],
                )
              }
            >
              {item.off ? "Manter" : "Tirar"}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/15 px-[22px] pb-[22px] pt-[18px]">
        <span className="text-sm text-muted-foreground" role="status" aria-live="polite">
          Nada é salvo sem você tocar aqui.
        </span>
        <button
          type="button"
          className={cn(BTN, "min-h-[50px]")}
          disabled={count === 0}
          data-landing-action="complete"
          data-landing-scenario={scenario}
          onClick={() => setSaved(true)}
        >
          {count === 0
            ? "Nada para salvar"
            : `Salvar ${count} ${count === 1 ? "atividade" : "atividades"}`}
        </button>
      </div>
    </>
  );
}

/**
 * O teste sem criar conta, como na prancha: um recado de exemplo no papel, a
 * revisão como ela é no app (com a origem de cada data e o "a confirmar"
 * quando a escola não deu data) e a semana que fica. Nada sai desta página, e
 * as datas acompanham o dia de hoje, para "amanhã" querer dizer amanhã.
 */
export function AiDemo({ todayIso }: { todayIso: string }) {
  const [scenario, setScenario] = useState<LandingScenario>("cartaz");
  const data = SCENARIOS[scenario] as Scenario;
  const lineDates = {
    ddmm: (offset: number) => ddmmOf(addSchoolDaysIso(todayIso, offset)),
    day: (offset: number) => {
      const iso = addSchoolDaysIso(todayIso, offset);
      return `${weekdayLong(iso).toLowerCase()} (${ddmmOf(iso)})`;
    },
  };

  return (
    <section id="demonstracao" aria-labelledby="demo-title" className={`${SEC} ${SEC_LIGHT}`}>
      <div className={`${WRAP} flex flex-col gap-9`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[640px] flex-col gap-3.5">
            <p className={EYEBROW}>Experimente sem criar conta</p>
            <h2 id="demo-title" className={H2}>
              Faça o teste com um recado de exemplo.
            </h2>
            <p className="text-base text-muted-foreground">
              Os dados são de mentirinha e nada sai desta página. As datas acompanham o dia de hoje.
            </p>
          </div>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Escolha um exemplo</legend>
            {ORDER.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={scenario === key}
                data-landing-action="scenario"
                data-landing-scenario={key}
                onClick={() => setScenario(key)}
                className={cn(
                  "min-h-11 rounded-xl border-[1.5px] px-4 text-[15px] font-bold",
                  scenario === key
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/25 hover:bg-foreground/5",
                )}
              >
                {SCENARIOS[key]?.label}
              </button>
            ))}
          </fieldset>
        </div>

        <div className={cn(GRID2, "items-start gap-7")}>
          <figure className="flex flex-col gap-3.5 rounded-[10px] border border-foreground/15 bg-background px-7 py-[30px] shadow-[0_14px_30px_-18px_color-mix(in_oklch,var(--foreground)_35%,transparent)]">
            <figcaption className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
              O recado que chegou · {data.source}
            </figcaption>
            <b className="text-[22px] tracking-[-0.01em]">{data.paperTitle}</b>
            <div className="flex flex-col gap-2 text-[19px] leading-normal">
              {data.lines(lineDates).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          </figure>
          <div className={cn(SHEET, "overflow-hidden")}>
            <DemoReview key={scenario} scenario={scenario} todayIso={todayIso} />
          </div>
        </div>
      </div>
    </section>
  );
}

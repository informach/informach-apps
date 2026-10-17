"use client";

import { cn } from "@informach/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { addDaysIso } from "@/features/dashboard/date";
import {
  addSchoolDaysIso,
  formatClockTime,
  longDayLabel,
  shortDayLabel,
} from "@/features/dashboard/day-labels";
import type { LandingScenario } from "@/features/metrics/landing-schema";
import styles from "../sales.module.css";
import { SalesCta } from "../sales-cta";

type Origin = "school" | "unspecified" | "family";
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
  /** As linhas do recado, com as datas como a escola escreve (dd/mm). */
  lines: (dates: (offset: number) => string) => string[];
  noun: [string, string];
  items: DemoItem[];
};

const KID = "Clara";

const SCENARIOS: Record<LandingScenario, Scenario> = {
  cartaz: {
    label: "Cartaz de provas",
    source: "foto do cartaz",
    paperTitle: "Avaliações · 3º ano B",
    lines: (d) => [
      `Português · ${d(3)} · interpretação de texto`,
      `Matemática · ${d(8)} · tabuada`,
      `Ciências · ${d(10)} · ciclo da água`,
      `Inglês · ${d(11)} · unit 4`,
    ],
    noun: ["prova", "provas"],
    items: [
      { id: "pt", title: "Prova de Português", subject: "Português", dot: "bg-chart-2", offset: 3 },
      {
        id: "mat",
        title: "Prova de Matemática",
        subject: "Matemática",
        dot: "bg-chart-1",
        offset: 8,
      },
      { id: "cie", title: "Prova de Ciências", subject: "Ciências", dot: "bg-chart-3", offset: 10 },
      {
        id: "ing",
        title: "Prova de Inglês",
        subject: "Sem matéria",
        dot: "",
        offset: 11,
        warn: `Inglês não está nas matérias de ${KID}. Na Agenda, dá para escolher a matéria aqui.`,
      },
    ],
  },
  passeio: {
    label: "Passeio",
    source: "mensagem do grupo",
    paperTitle: "Grupo das famílias · 3º B",
    lines: (d) => [
      `O passeio ao museu será dia ${d(2)}, às 8h.`,
      `Enviem a autorização assinada até ${d(1)}.`,
      "Levar boné e garrafa de água.",
    ],
    noun: ["atividade", "atividades"],
    items: [
      { id: "aut", title: "Enviar autorização", subject: "Autorização", dot: "", offset: 1 },
      {
        id: "bone",
        title: "Separar boné e garrafa",
        subject: "Material",
        dot: "",
        offset: null,
        planFor: "passeio",
      },
      {
        id: "passeio",
        title: "Passeio ao museu",
        subject: "Evento",
        dot: "",
        offset: 2,
        time: "08:00",
      },
    ],
  },
  prova: {
    label: "Prova",
    source: "foto da agenda",
    paperTitle: "Agenda da Clara",
    lines: (d) => [`Prova de Ciências dia ${d(5)}.`, "Estudar as páginas 24 a 31 do livro."],
    noun: ["atividade", "atividades"],
    items: [
      {
        id: "estudo",
        title: "Estudar as páginas 24 a 31",
        subject: "Ciências",
        dot: "bg-chart-3",
        offset: null,
      },
      {
        id: "prova",
        title: "Prova de Ciências",
        subject: "Ciências",
        dot: "bg-chart-3",
        offset: 5,
      },
    ],
  },
  material: {
    label: "Material",
    source: "comunicado em PDF",
    paperTitle: "Aula de Artes",
    lines: (d) => [
      `Para a aula de Artes de ${d(2)}, cada criança deve trazer:`,
      "uma caixa de sapatos, cola branca e papéis coloridos.",
    ],
    noun: ["atividade", "atividades"],
    items: [
      {
        id: "artes",
        title: "Levar o material de Artes",
        subject: "Artes",
        dot: "bg-chart-4",
        offset: 2,
      },
    ],
  },
};

const ORIGIN_LABEL: Record<Origin, string> = {
  school: "a escola disse",
  unspecified: "a confirmar",
  family: "planejado por vocês",
};

function ddmm(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

function DemoReview({ scenario, todayIso }: { scenario: LandingScenario; todayIso: string }) {
  const data = SCENARIOS[scenario];
  const [removed, setRemoved] = useState<string[]>([]);
  const [planned, setPlanned] = useState(false);
  const [saved, setSaved] = useState(false);
  // Salvar e recomeçar trocam o bloco inteiro, e o botão tocado some com ele:
  // o foco vai para o título do que apareceu, e não para o começo da página.
  const savedTitle = useRef<HTMLParagraphElement>(null);
  const reviewTitle = useRef<HTMLParagraphElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    (saved ? savedTitle : reviewTitle).current?.focus();
  }, [saved]);
  // A escola marca em dia de aula: contar em dias corridos punha prova no
  // domingo em seis dias de cada sete. A véspera é o dia anterior no
  // calendário, porque separar o boné é coisa de casa.
  const day = (offset: number) => addSchoolDaysIso(todayIso, offset);
  const planTarget = data.items.find((item) => item.id === "passeio");
  const plannedIso = planTarget?.offset ? addDaysIso(day(planTarget.offset), -1) : null;

  const resolved = data.items.map((item) => {
    const iso =
      item.offset !== null ? day(item.offset) : item.planFor && planned ? plannedIso : null;
    const origin: Origin =
      item.offset !== null ? "school" : item.planFor && planned ? "family" : "unspecified";
    return { ...item, iso, origin, off: removed.includes(item.id) };
  });
  const kept = resolved.filter((item) => !item.off);
  const [one, many] = data.noun;

  if (saved) {
    // Um dia por linha, na ordem, com o que ficou em cada um. Era uma grade de
    // sete dias a partir de hoje, e o cartaz de provas, que vai além disso,
    // salvava quatro provas e mostrava uma.
    const days = [...new Set(kept.flatMap((item) => (item.iso ? [item.iso] : [])))].sort();
    const undated = kept.filter((item) => !item.iso);
    const rows = [
      ...days.map((iso) => ({
        key: iso,
        label: shortDayLabel(iso, todayIso),
        items: kept.filter((item) => item.iso === iso),
      })),
      ...(undated.length ? [{ key: "sem-data", label: "sem data", items: undated }] : []),
    ];
    return (
      <div className="space-y-4">
        <div role="status" aria-live="polite">
          <p
            ref={savedTitle}
            tabIndex={-1}
            className="text-xl font-extrabold tracking-tight outline-none"
          >
            Salvo na agenda de {KID}
          </p>
          <p className="text-[15px] text-muted-foreground">Assim ficam os próximos dias.</p>
        </div>
        <ul className="overflow-hidden rounded-2xl border border-foreground/15">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[88px_1fr] gap-3 border-t border-foreground/15 px-3 py-2 first:border-t-0"
            >
              <span className="text-[13px] font-bold text-muted-foreground">{row.label}</span>
              <span className="text-[14px]">
                {row.items.map((item) => (
                  <span key={item.id} className="block">
                    <strong>{item.title}</strong>
                    {item.time ? `, ${formatClockTime(item.time)}` : ""}
                    <span className="block text-[13px] text-muted-foreground">{item.subject}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {undated.length ? (
          <p className="text-sm text-muted-foreground">
            O que ficou sem data aparece em Hoje, como a confirmar, até alguém marcar o dia.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-xl border border-foreground/15 px-4 font-bold hover:bg-muted"
            onClick={() => {
              setSaved(false);
              setRemoved([]);
              setPlanned(false);
            }}
          >
            Recomeçar o teste
          </button>
          <SalesCta placement="demo" label="Fazer com um recado meu" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p
          ref={reviewTitle}
          tabIndex={-1}
          className="text-xl font-extrabold tracking-tight outline-none"
        >
          A Agenda achou {data.items.length} {data.items.length === 1 ? one : many} para {KID}
        </p>
        <p className="text-[15px] text-muted-foreground">
          Confira as datas. O que a escola não disse fica a confirmar.
        </p>
      </div>
      <ul className="overflow-hidden rounded-2xl border border-foreground/15">
        {resolved.map((item) => (
          <li key={item.id} className="border-t border-foreground/15 px-3 py-3 first:border-t-0">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-2 size-2.5 shrink-0 rounded-full",
                  item.dot || "border-[1.5px] border-dashed border-muted-foreground",
                )}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[16px] font-bold leading-snug",
                    item.off && "text-muted-foreground line-through",
                  )}
                >
                  {item.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.subject} ·{" "}
                  {item.iso
                    ? `${shortDayLabel(item.iso, todayIso)}${item.time ? ` · ${formatClockTime(item.time)}` : ""}`
                    : "sem data"}
                  , {ORIGIN_LABEL[item.origin]}
                </p>
                {item.warn && !item.off ? (
                  <p className="mt-1 text-sm font-semibold text-chart-4-ink">{item.warn}</p>
                ) : null}
                {item.planFor && !item.off ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-foreground/15 px-3 text-sm font-bold hover:bg-muted disabled:text-muted-foreground"
                    disabled={planned}
                    data-landing-action="plan"
                    data-landing-scenario={scenario}
                    onClick={() => setPlanned(true)}
                  >
                    {planned && plannedIso
                      ? `Planejado para ${shortDayLabel(plannedIso, todayIso)}`
                      : "Planejar para a véspera"}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`${item.off ? "Manter" : "Tirar"}: ${item.title}`}
                className={cn(
                  "inline-flex min-h-11 min-w-[68px] shrink-0 items-center justify-center rounded-xl px-3 text-sm font-bold",
                  item.off
                    ? "bg-foreground text-background"
                    : "border border-foreground/15 hover:bg-muted",
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
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {planned && plannedIso
          ? `Separar boné e garrafa ficou para ${longDayLabel(plannedIso, todayIso).toLowerCase()}, planejado por vocês. A autorização continua com a data da escola.`
          : "Nada é salvo sem você tocar aqui."}
      </p>
      <button
        type="button"
        className={styles.button}
        disabled={kept.length === 0}
        data-landing-action="complete"
        data-landing-scenario={scenario}
        onClick={() => setSaved(true)}
      >
        {kept.length === 0
          ? "Nada para salvar"
          : `Salvar ${kept.length} ${kept.length === 1 ? one : many}`}
      </button>
    </div>
  );
}

/**
 * O teste sem criar conta: um recado de exemplo, a revisão como ela é no app
 * (com a origem de cada data e o "a confirmar" quando a escola não deu data) e
 * a semana que fica. Nada sai desta página, e as datas acompanham o dia de
 * hoje, para "amanhã" querer dizer amanhã.
 */
export function AiDemo({ todayIso }: { todayIso: string }) {
  const [scenario, setScenario] = useState<LandingScenario>("cartaz");
  const data = SCENARIOS[scenario];
  const dates = (offset: number) => ddmm(addSchoolDaysIso(todayIso, offset));

  return (
    <section
      id="demonstracao"
      aria-labelledby="demo-title"
      className="scroll-mt-6 border-y border-foreground/15 bg-muted/40 py-16 md:py-24"
    >
      <div className={[styles.wrap, "space-y-8"].join(" ")}>
        <div className="space-y-3">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
            Experimente sem criar conta
          </p>
          <h2
            id="demo-title"
            className="text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]"
          >
            Faça o teste com um recado de exemplo.
          </h2>
          <p className="max-w-[40rem] text-[16px] text-foreground/80">
            Os dados são de mentirinha e nada sai desta página. As datas acompanham o dia de hoje.
          </p>
          <fieldset className="flex flex-wrap gap-2 pt-2">
            <legend className="sr-only">Escolha um recado de exemplo</legend>
            {(Object.keys(SCENARIOS) as LandingScenario[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={scenario === key}
                data-landing-action="scenario"
                data-landing-scenario={key}
                onClick={() => setScenario(key)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold",
                  scenario === key
                    ? "bg-foreground text-background"
                    : "border border-foreground/15 bg-background hover:bg-muted",
                )}
              >
                {SCENARIOS[key].label}
              </button>
            ))}
          </fieldset>
        </div>
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <figure className="space-y-3 rounded-[20px] border border-foreground/15 bg-background p-5">
            <figcaption className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
              O recado que chegou · {data.source}
            </figcaption>
            <div className="rounded-2xl bg-chart-4/10 p-4">
              <p className="font-extrabold">{data.paperTitle}</p>
              <ul className="mt-2 space-y-1.5 font-mono text-[14px]">
                {data.lines(dates).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </figure>
          <div className="rounded-[20px] border border-foreground/15 bg-background p-5">
            <DemoReview key={scenario} scenario={scenario} todayIso={todayIso} />
          </div>
        </div>
      </div>
    </section>
  );
}

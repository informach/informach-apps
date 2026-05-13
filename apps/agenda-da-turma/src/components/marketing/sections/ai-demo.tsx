import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { ArrowDown, CalendarClock, FileText, ImagePlus, Mic, Sparkles } from "lucide-react";

type DemoColumn = {
  inputLabel: string;
  processingLabel: string;
  output: {
    title: string;
    badge: string;
    items: { label: string; chart: 1 | 2 | 3 | 4 | 5 }[];
  };
  input: React.ReactNode;
  accent: "primary" | "secondary";
};

function VoiceInput() {
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/10">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <Mic className="size-7 text-primary" aria-hidden />
        <div className="flex h-7 items-end gap-1" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className="block w-1 origin-bottom rounded-full bg-primary motion-safe:animate-wave-bar"
              style={{
                height: `${12 + (i % 3) * 8}px`,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>
        <p className="font-mono text-xs text-muted-foreground">0:12</p>
      </div>
    </div>
  );
}

function PhotoInput() {
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-secondary/15 via-secondary/5 to-primary/10">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-secondary">
        <ImagePlus className="size-8" aria-hidden />
        <p className="font-mono text-xs text-muted-foreground">quadro_semana.jpg</p>
      </div>
      <div className="absolute right-2 top-2">
        <Badge variant="outline" className="bg-background/90 text-[10px]">
          Foto do quadro
        </Badge>
      </div>
    </div>
  );
}

function PdfInput() {
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
        <FileText className="size-7 text-primary" aria-hidden />
        <div className="w-full rounded-md border border-border bg-card px-3 py-2 text-left">
          <p className="font-mono text-xs text-foreground">
            agenda_escolar_maio.pdf
            <span className="ml-0.5 inline-block w-px bg-foreground motion-safe:animate-blink-caret">
              &nbsp;
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

const COLUMNS: DemoColumn[] = [
  {
    input: <VoiceInput />,
    inputLabel: "Voz",
    processingLabel: "Transcrevendo e estruturando…",
    output: {
      title: "Prova de matemática",
      badge: "Por voz",
      items: [
        { label: "Pedro · Matemática", chart: 1 },
        { label: "Quarta, 28 de maio", chart: 1 },
      ],
    },
    accent: "primary",
  },
  {
    input: <PhotoInput />,
    inputLabel: "Foto",
    processingLabel: "IA lendo o quadro da semana…",
    output: {
      title: "3 atividades da semana",
      badge: "Da foto",
      items: [
        { label: "Trabalho de ciências", chart: 3 },
        { label: "Lição de português", chart: 2 },
        { label: "Prova de história", chart: 4 },
      ],
    },
    accent: "secondary",
  },
  {
    input: <PdfInput />,
    inputLabel: "PDF",
    processingLabel: "Processando agenda da escola…",
    output: {
      title: "Calendário do bimestre",
      badge: "Do PDF",
      items: [
        { label: "Festa junina", chart: 5 },
        { label: "Reunião de pais", chart: 4 },
        { label: "Mostra cultural", chart: 3 },
      ],
    },
    accent: "primary",
  },
];

function StepArrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-1 text-muted-foreground">
      <ArrowDown className="size-4 text-primary motion-safe:animate-pulse-glow" aria-hidden />
      <p className="text-center text-xs">{label}</p>
      <ArrowDown
        className="size-4 text-primary motion-safe:animate-pulse-glow"
        style={{ animationDelay: "0.5s" }}
        aria-hidden
      />
    </div>
  );
}

const CHART_DOT: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

function OutputCard({
  title,
  badge,
  items,
  accent,
}: {
  title: string;
  badge: string;
  items: { label: string; chart: 1 | 2 | 3 | 4 | 5 }[];
  accent: "primary" | "secondary";
}) {
  return (
    <Card
      className={`shadow-md ${accent === "primary" ? "border-primary/40" : "border-secondary/40"}`}
    >
      <CardHeader className="space-y-2 pb-3">
        <Badge variant={accent === "primary" ? "default" : "secondary"} className="w-fit gap-1">
          <Sparkles className="size-3" aria-hidden />
          {badge}
        </Badge>
        <p className="text-base font-semibold leading-tight tracking-tight">{title}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <span className={`size-1.5 shrink-0 rounded-full ${CHART_DOT[item.chart]}`} />
              {item.label}
            </li>
          ))}
          <li className="flex items-center gap-2 pt-1 text-xs text-muted-foreground/80">
            <CalendarClock className="size-3" aria-hidden />
            Pronto pra revisar e salvar
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

export function AiDemo() {
  return (
    <section
      id="ia-demo"
      className="relative overflow-hidden border-y border-border/60 bg-gradient-to-b from-primary/[0.04] via-background to-secondary/[0.05] py-20 md:py-28"
    >
      <div
        className="pointer-events-none absolute -left-20 top-1/2 -z-10 size-80 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-0 -z-10 size-72 rounded-full bg-secondary/10 blur-3xl"
        aria-hidden
      />

      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">IA em ação</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Cadastra do jeito que dá. A gente organiza.
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
            Você fala, fotografa o quadro ou envia o PDF da escola. A IA entende data, matéria e
            qual filho é.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-8 md:grid-cols-3 md:gap-6 lg:gap-8">
          {COLUMNS.map((col) => (
            <div key={col.inputLabel} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.inputLabel}
                </p>
                <span
                  className={`inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ${
                    col.accent === "primary"
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary/15 text-secondary"
                  }`}
                >
                  {COLUMNS.indexOf(col) + 1}
                </span>
              </div>

              {col.input}

              <StepArrow label={col.processingLabel} />

              <OutputCard
                title={col.output.title}
                badge={col.output.badge}
                items={col.output.items}
                accent={col.accent}
              />
            </div>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-xl text-center text-sm text-muted-foreground">
          Voz consome 2 créditos (transcrição e parse). Foto e PDF, 1 crédito cada. O Pro vem com 70
          créditos por mês.
        </p>
      </div>
    </section>
  );
}

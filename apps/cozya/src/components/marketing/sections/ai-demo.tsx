import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent, CardHeader } from "@informach/ui/components/card";
import { ArrowDown, ImagePlus, Mic, Sparkles } from "lucide-react";

type DemoColumn = {
  inputLabel: string;
  processingLabel: string;
  output: {
    name: string;
    badge: string;
    ingredients: string[];
  };
  input: React.ReactNode;
  accent: "primary" | "secondary";
};

function PhotoInput() {
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/10">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-primary">
        <ImagePlus className="size-8" aria-hidden />
        <p className="font-mono text-xs text-muted-foreground">IMG_4231.jpg</p>
      </div>
      <div className="absolute right-2 top-2">
        <Badge variant="outline" className="bg-background/90 text-[10px]">
          Print do WhatsApp
        </Badge>
      </div>
    </div>
  );
}

function VoiceInput() {
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-secondary/15 via-secondary/5 to-primary/10">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <Mic className="size-7 text-secondary" aria-hidden />
        <div className="flex h-7 items-end gap-1" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className="block w-1 origin-bottom rounded-full bg-secondary motion-safe:animate-wave-bar"
              style={{
                height: `${12 + (i % 3) * 8}px`,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </div>
        <p className="font-mono text-xs text-muted-foreground">0:08</p>
      </div>
    </div>
  );
}

function PromptInput() {
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
        <Sparkles className="size-7 text-primary" aria-hidden />
        <div className="w-full rounded-md border border-border bg-card px-3 py-2 text-left">
          <p className="font-mono text-sm text-foreground">
            massa de nhoque sem batata
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
    input: <PhotoInput />,
    inputLabel: "Foto",
    processingLabel: "IA lendo a imagem…",
    output: {
      name: "Pão de queijo da vó",
      badge: "Importada de foto",
      ingredients: ["500 g polvilho azedo", "1 xíc. leite", "1/2 xíc. óleo", "200 g queijo minas"],
    },
    accent: "primary",
  },
  {
    input: <VoiceInput />,
    inputLabel: "Voz",
    processingLabel: "Transcrevendo e estruturando…",
    output: {
      name: "Bolo de cenoura fofinho",
      badge: "Por voz",
      ingredients: ["3 cenouras médias", "3 ovos", "1 xíc. óleo", "2 xíc. açúcar"],
    },
    accent: "secondary",
  },
  {
    input: <PromptInput />,
    inputLabel: "Prompt",
    processingLabel: "Buscando na web e estruturando…",
    output: {
      name: "Nhoque de mandioquinha",
      badge: "Gerada com busca",
      ingredients: ["500 g mandioquinha", "1 ovo", "1 xíc. farinha", "Sal a gosto"],
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

function OutputCard({
  name,
  badge,
  ingredients,
  accent,
}: {
  name: string;
  badge: string;
  ingredients: string[];
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
        <p className="text-base font-semibold leading-tight tracking-tight">{name}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {ingredients.map((line) => (
            <li key={line} className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-primary/70" />
              {line}
            </li>
          ))}
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
            Capture do jeito que dá. Cozya estrutura.
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
            Foto, voz ou só uma ideia. Em segundos vira receita estruturada — pronta pra cozinhar.
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
                name={col.output.name}
                badge={col.output.badge}
                ingredients={col.output.ingredients}
                accent={col.accent}
              />
            </div>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-xl text-center text-sm text-muted-foreground">
          Cada captura consome 1 crédito. Pro vem com 50 créditos por mês — chega pra capturar uma
          receita por dia, com sobra.
        </p>
      </div>
    </section>
  );
}

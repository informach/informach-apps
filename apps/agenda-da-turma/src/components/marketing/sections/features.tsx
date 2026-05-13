import { Badge } from "@informach/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import {
  CalendarDays,
  FileDown,
  LayoutDashboard,
  type LucideIcon,
  Mic,
  Share2,
  Users,
} from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  highlight?: boolean;
  proOnly?: boolean;
};

const FEATURES: Feature[] = [
  {
    icon: Users,
    title: "Um perfil pra cada filho",
    description:
      "Cadastra cada criança separada. Cada uma com sua cor, suas turmas, suas matérias. No Free cabe 1 filho. No Pro cabem 3.",
    highlight: true,
  },
  {
    icon: Mic,
    title: "Cadastro por IA (voz, foto e PDF)",
    description:
      'A IA reconhece data ("quarta-feira"), matéria ("mat"), tipo ("prova"). Mostra a lista, você só confirma. Custa créditos do seu plano.',
    highlight: true,
    proOnly: true,
  },
  {
    icon: CalendarDays,
    title: "Calendário escolar de verdade",
    description:
      "Mês, semana, dia. Cada matéria com sua cor. Atrasadas em vermelho, hoje destacado. Clica num dia vazio e cadastra ali mesmo.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard que avisa o que vem",
    description:
      "KPIs de atrasadas, hoje e próximos 7 dias. Filtra por filho ou vê tudo junto. Sem surpresa de prova no dia da prova.",
  },
  {
    icon: Share2,
    title: "Compartilhe com outros pais da turma",
    description:
      "Você cadastra a prova. Os outros pais da mesma turma do seu filho recebem. Sem chain de WhatsApp, sem cobrança no grupo.",
    proOnly: true,
  },
  {
    icon: FileDown,
    title: "Exporta a agenda em PDF",
    description:
      "Manda pra avó, gruda na geladeira, leva pra reunião de pais. Lista completa por data, organizada e fácil de ler.",
    proOnly: true,
  },
];

export function Features() {
  return (
    <section id="recursos" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Recursos</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Tudo o que falta no caderninho. Nada do que sobra no grupo.
        </h2>
        <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
          Cadastro flexível, calendário do jeito que pai e mãe usam, e IA pra resolver o que era
          trabalho manual.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description, highlight, proOnly }) => (
          <Card
            key={title}
            className={`transition-all hover:-translate-y-0.5 hover:shadow-md ${
              highlight ? "border-primary/40 bg-primary/[0.02]" : "border-border/70"
            }`}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`flex size-10 items-center justify-center rounded-md ${
                    highlight ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                {proOnly && (
                  <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
                    Pro
                  </Badge>
                )}
              </div>
              <CardTitle className="pt-3 text-lg">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

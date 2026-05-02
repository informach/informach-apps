import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { Archive, ChefHat, type LucideIcon, Users } from "lucide-react";

type Persona = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const PERSONAS: Persona[] = [
  {
    icon: ChefHat,
    title: "Quem cozinha no dia a dia",
    description:
      "Acha sua receita em 2 segundos no celular, com a mão suja de massa. Busca por nome, abre, cozinha.",
  },
  {
    icon: Archive,
    title: "Quem tem acervo bagunçado",
    description:
      "Anos de prints, papéis e PDFs viram cards padronizados. Importa pelo seu jeito — texto, foto ou voz.",
  },
  {
    icon: Users,
    title: "Quem cozinha em família",
    description:
      "Compartilha receita pelo WhatsApp em 1 clique. Recebe foto de receita e salva direto no app.",
  },
];

export function Audience() {
  return (
    <section id="para-quem" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Para quem é</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Pra quem cozinha e quer parar de procurar.
        </h2>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {PERSONAS.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="border-border/70 transition-shadow hover:shadow-md">
            <CardHeader>
              <span className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
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

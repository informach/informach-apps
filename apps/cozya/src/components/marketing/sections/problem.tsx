import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { Brain, ImageIcon, MessagesSquare } from "lucide-react";

const FRICTIONS = [
  {
    icon: ImageIcon,
    title: "Receitas viram print",
    description:
      "Centenas de fotos na galeria, sem nome, sem busca. Você já desistiu antes de achar.",
  },
  {
    icon: MessagesSquare,
    title: "Mensagens se perdem",
    description:
      "Aquela receita que sua mãe mandou no WhatsApp foi pro fundo do chat. E você nem lembra qual contato.",
  },
  {
    icon: Brain,
    title: "Memória falha",
    description:
      "Você lembra do nome do prato. Não lembra do passo a passo. De novo. Pela terceira vez.",
  },
] as const;

export function Problem() {
  return (
    <section
      id="problema"
      className="relative bg-gradient-to-b from-destructive/[0.04] via-transparent to-transparent py-20 md:py-28"
    >
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">O problema</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Cozinhar em casa virou caça ao tesouro.
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
            A receita está em algum lugar. Print, áudio, screenshot, papel rasurado. E a fome não
            espera.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {FRICTIONS.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border-border/70">
              <CardHeader>
                <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
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
      </div>
    </section>
  );
}

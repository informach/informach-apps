import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { BookX, Brain, MessagesSquare } from "lucide-react";

const FRICTIONS = [
  {
    icon: BookX,
    title: "O caderno some",
    description:
      "A tarefa estava anotada no caderno. O caderno ficou na escola. Você descobriu que tinha prova quando o filho voltou chorando.",
  },
  {
    icon: MessagesSquare,
    title: "O grupo da turma vira spam",
    description:
      "São 12 mães mandando foto da agenda ao mesmo tempo. Você não acha mais nada. E perde o recado importante.",
  },
  {
    icon: Brain,
    title: "Cabeça de pai não dá conta",
    description:
      "Dois filhos, dois cadernos, duas turmas, cinco matérias cada. Você lembra de uma prova. Esquece a outra.",
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
            Acompanhar a rotina escolar virou jogo de adivinhação.
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
            O caderno desapareceu. O grupo do WhatsApp tem 487 mensagens não lidas. E a prova é
            amanhã.
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

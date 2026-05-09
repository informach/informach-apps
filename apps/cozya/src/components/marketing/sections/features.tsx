import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import {
  Heart,
  ImagePlus,
  type LucideIcon,
  MessagesSquare,
  Mic,
  Send,
  Sparkles,
} from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
  highlight?: boolean;
};

const FEATURES: Feature[] = [
  {
    icon: Mic,
    title: "Captura por voz",
    description:
      "Mãos sujas na cozinha? Diga o nome da receita e a IA encontra. Ou dite a receita inteira em alta voz — vira card estruturado em segundos.",
    highlight: true,
  },
  {
    icon: ImagePlus,
    title: "Captura por imagem",
    description:
      "Print de WhatsApp, foto de caderno, screenshot do Instagram. Cola, sobe ou tira foto na hora — a IA estrutura.",
  },
  {
    icon: Sparkles,
    title: "Geração com busca na web",
    description:
      "Digite 'bolo de cenoura sem glúten' e a IA pesquisa, valida e estrutura uma receita pronta. Sem inventar ingrediente.",
    highlight: true,
  },
  {
    icon: MessagesSquare,
    title: "Refinamento conversando",
    description:
      "'Faz vegana.' 'Metade das porções.' 'Substitui o açúcar por mel.' A IA adapta sua receita conversando com você.",
    highlight: true,
  },
  {
    icon: Send,
    title: "Compartilhe no WhatsApp",
    description:
      "Texto formatado pronto, com ingredientes e preparo. Um toque e tá no chat de quem você quiser.",
  },
  {
    icon: Heart,
    title: "Acervo organizado",
    description:
      "Busca por nome, marca favoritos, encontra em 2 segundos com a mão suja de massa. Aberto direto no navegador.",
  },
];

export function Features() {
  return (
    <section id="recursos" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Recursos</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Quatro maneiras de capturar. Uma maneira de cozinhar.
        </h2>
        <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
          Cada usuária tem seu jeito de receber receita. O Cozya aceita todos.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description, highlight }) => (
          <Card
            key={title}
            className={`transition-all hover:-translate-y-0.5 hover:shadow-md ${
              highlight ? "border-primary/40 bg-primary/[0.02]" : "border-border/70"
            }`}
          >
            <CardHeader>
              <span
                className={`flex size-10 items-center justify-center rounded-md ${
                  highlight ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary"
                }`}
              >
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

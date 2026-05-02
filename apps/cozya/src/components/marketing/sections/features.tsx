import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { Camera, ImagePlus, type LucideIcon, Mic, Send, Sparkles, WifiOff } from "lucide-react";

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: ImagePlus,
    title: "Importação por imagem",
    description:
      "Print, foto de caderno, screenshot do WhatsApp. Cola, arrasta ou faz upload — a IA estrutura.",
  },
  {
    icon: Sparkles,
    title: "Geração por título",
    description:
      "Digita 'bolo de cenoura fofinho' e ganha receita completa. Revisa, ajusta, salva.",
  },
  {
    icon: Mic,
    title: "Ditado por voz",
    description:
      "Fala o nome, achou. Fala a receita inteira, virou card. Mãos sujas? Sem problema.",
  },
  {
    icon: Camera,
    title: "Câmera direta",
    description:
      "Aponta pro caderno da vovó ou pra embalagem do produto. Captura e estrutura na hora.",
  },
  {
    icon: Send,
    title: "Compartilhar no WhatsApp",
    description:
      "Texto já formatado, com ingredientes e preparo. Um toque e tá no chat de quem você quiser.",
  },
  {
    icon: WifiOff,
    title: "PWA com modo offline",
    description:
      "Instala como app no celular. Abre receitas já carregadas mesmo sem internet — pra cozinhar onde for.",
  },
];

export function Features() {
  return (
    <section id="recursos" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Recursos</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Tudo que você precisa, nada que atrapalha.
        </h2>
        <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
          Foco no básico bem feito: salvar fácil, achar rápido, cozinhar no celular.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="border-border/70 transition-shadow hover:shadow-md">
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
    </section>
  );
}

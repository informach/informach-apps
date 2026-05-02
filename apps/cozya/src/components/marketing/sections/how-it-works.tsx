const STEPS = [
  {
    number: "01",
    title: "Capture",
    description:
      "Cola um texto, sobe uma imagem, abre a câmera ou dita pelo microfone. Aceita print de WhatsApp, foto de caderno e áudio.",
  },
  {
    number: "02",
    title: "A IA estrutura",
    description:
      "Em segundos, a receita vira um card com nome, ingredientes, preparo e finalização — pronta pra usar.",
  },
  {
    number: "03",
    title: "Você revisa",
    description:
      "Antes de salvar, ajusta o que quiser. Nada vai pro acervo sem o seu OK. A IA sugere, você decide.",
  },
  {
    number: "04",
    title: "Cozinhe e compartilhe",
    description:
      "Abre rápido no celular, mesmo offline. Manda por WhatsApp em 1 toque, com texto formatado.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="como-funciona" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Como funciona</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Capture de qualquer jeito. Cozinhe do mesmo jeito.
        </h2>
        <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
          Quatro passos simples. O resto é com você e o fogão.
        </p>
      </div>

      <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li
            key={step.number}
            className="relative rounded-2xl border border-border/70 bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <span
              className="font-mono text-3xl font-semibold tracking-tight text-primary"
              aria-hidden
            >
              {step.number}
            </span>
            <h3 className="mt-3 text-lg font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

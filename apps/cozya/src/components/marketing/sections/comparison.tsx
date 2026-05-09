import { Check, X } from "lucide-react";

const ROWS = [
  {
    old: "Galeria com 800 prints sem nome",
    new: "Tudo nomeado e com busca instantânea",
  },
  {
    old: "Digitar receita inteira do zero",
    new: "Cola texto, sobe foto ou dita por voz. A IA estrutura em segundos",
  },
  {
    old: "Pesquisar no Google, abrir 5 abas e adaptar pelo seu jeito",
    new: "Descreve em uma frase e a IA pesquisa na web e estrutura",
  },
  {
    old: "Pedir de novo a receita pra mãe",
    new: "Salvou uma vez, achou pra sempre",
  },
  {
    old: "Sem internet, sem receita",
    new: "Abre direto no navegador do celular, sem loja de apps",
  },
  {
    old: "Achar receita perdida em 5 lugares",
    new: "Tudo num lugar só, organizado por favorito",
  },
] as const;

export function Comparison() {
  return (
    <section id="comparativo" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Antes & depois</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Jeito antigo × Jeito Cozya.
        </h2>
        <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
          A diferença entre procurar e cozinhar.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-destructive/30 bg-card/50 p-6 md:p-8">
          <h3 className="text-lg font-semibold tracking-tight text-muted-foreground">
            Sem o Cozya
          </h3>
          <ul className="mt-5 space-y-4">
            {ROWS.map((row) => (
              <li key={row.old} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                  <X className="size-3" aria-hidden />
                </span>
                <span className="text-sm text-muted-foreground leading-relaxed">{row.old}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border-2 border-primary/40 bg-card p-6 shadow-md md:p-8">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Com o Cozya</h3>
          <ul className="mt-5 space-y-4">
            {ROWS.map((row) => (
              <li key={row.new} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-3" aria-hidden />
                </span>
                <span className="text-sm text-foreground leading-relaxed">{row.new}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

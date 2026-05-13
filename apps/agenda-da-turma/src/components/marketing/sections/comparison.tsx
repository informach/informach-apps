import { Check, X } from "lucide-react";

const ROWS = [
  {
    old: "Caderno na mochila, tarefa só na cabeça",
    new: "Tudo num lugar, busca por data ou matéria",
  },
  {
    old: "Anotar prova num post-it que cai do armário",
    new: "Foto do quadro e a IA estrutura em segundos",
  },
  {
    old: "Lembrar do trabalho só no dia da entrega",
    new: "Dashboard avisa o que vence nos próximos 7 dias",
  },
  {
    old: "Dois filhos, dois cadernos, confusão garantida",
    new: "Um perfil pra cada filho, calendário separado",
  },
  {
    old: "PDF da escola parado no e-mail desde fevereiro",
    new: "Envia o PDF e ele vira lista de tarefas no calendário",
  },
  {
    old: "Pais do grupo te perguntando se tem prova amanhã",
    new: "Compartilha com a turma e todo mundo enxerga",
  },
] as const;

export function Comparison() {
  return (
    <section id="comparativo" className="container mx-auto px-4 py-20 md:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Antes e depois</p>
        <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Jeito antigo × Com a Agenda da Turma.
        </h2>
        <p className="mt-4 text-pretty text-base text-muted-foreground leading-relaxed md:text-lg">
          A diferença entre apagar incêndio e acompanhar a rotina de cabeça erguida.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-destructive/30 bg-card/50 p-6 md:p-8">
          <h3 className="text-lg font-semibold tracking-tight text-muted-foreground">
            Sem a Agenda da Turma
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
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Com a Agenda da Turma
          </h3>
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

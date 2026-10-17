import { cn } from "@informach/ui/lib/utils";
import { DOT, GRID2, H2, LEAD, SEC, WRAP } from "../landing-ui";

const CARD = "flex flex-col gap-2.5 rounded-[20px] bg-background px-[22px] py-5 text-foreground";
const TAG =
  "inline-flex h-9 items-center whitespace-nowrap rounded-full border border-background/20 bg-background/10 px-3.5 text-[13px] font-bold text-background";

/**
 * A turma recebe junto, na faixa escura da prancha: uma família organiza o
 * cartaz e a turma inteira recebe as mesmas atividades para aceitar.
 *
 * Escuro com os tokens: o fundo é a cor do texto e o texto é a cor do fundo,
 * então no tema escuro a faixa se inverte junto com o resto da página.
 */
export function Turma() {
  return (
    <section
      id="turma"
      aria-labelledby="turma-title"
      className={`${SEC} bg-foreground text-background`}
    >
      <div className={`${WRAP} ${GRID2}`}>
        <div className="flex flex-col gap-[22px]">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-[color:color-mix(in_oklch,var(--primary)_55%,var(--background))]">
            A turma recebe junto
          </p>
          <h2 id="turma-title" className={cn(H2, "text-background")}>
            Uma família organiza o cartaz de provas, e a turma toda recebe.
          </h2>
          <p className={cn(LEAD, "text-background/85")}>
            Quando alguém da turma traz o calendário de provas para a Agenda, as outras famílias
            recebem as mesmas atividades e só aceitam. Se a escola mudar a data, quem mandou corrige
            para todo mundo. Quem vai cuidar, o lembrete e o que já foi feito continuam sendo só de
            cada casa.
          </p>
          <ul className="flex flex-wrap gap-3">
            {["Receber é grátis", "Mandar para a turma é do Pro", "A turma entra por um link"].map(
              (item) => (
                <li key={item} className={TAG}>
                  {item}
                </li>
              ),
            )}
          </ul>
        </div>
        <div className="flex w-full max-w-[460px] flex-col gap-3.5 justify-self-center">
          <div className={CARD}>
            <span className="text-[13px] font-extrabold text-muted-foreground">
              FAMÍLIA DA CLARA
            </span>
            <b className="text-[19px]">Mandar 4 provas para a turma do 3º B?</b>
            <span className="text-[15px] text-foreground/80">
              As outras famílias recebem e decidem se aceitam.
            </span>
            <span className="inline-flex min-h-11 items-center self-start rounded-xl bg-primary px-[18px] font-bold text-primary-foreground">
              Mandar para a turma
            </span>
          </div>
          <div aria-hidden className="self-center text-2xl text-background/50">
            ↓
          </div>
          <div className={CARD}>
            <span className="text-[13px] font-extrabold text-muted-foreground">
              OUTRA FAMÍLIA DO 3º B · PLANO GRÁTIS
            </span>
            <b className="text-[19px]">4 atividades da turma esperando você</b>
            <div className="flex flex-col gap-1.5 text-[15px]">
              <span>
                <span className={`${DOT} bg-chart-2`} /> Prova de Português · qui, 22
              </span>
              <span>
                <span className={`${DOT} bg-chart-1`} /> Prova de Matemática · ter, 27
              </span>
              <span className="text-muted-foreground">e mais 2</span>
            </div>
            <span className="inline-flex min-h-11 items-center self-start rounded-xl border-[1.5px] border-foreground px-[18px] font-bold">
              Aceitar as 4
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

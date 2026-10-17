import { ArrowDown } from "lucide-react";
import styles from "../sales.module.css";

/**
 * A turma recebe junto. Estava só no FAQ e numa letra miúda dos planos, e é o
 * jeito que a Agenda chega a outras famílias: uma organiza o cartaz e a turma
 * inteira recebe as mesmas atividades para aceitar.
 */
export function Turma() {
  return (
    <section
      id="turma"
      aria-labelledby="turma-title"
      className="scroll-mt-6 border-y border-foreground/15 bg-muted/40 py-16 md:py-24"
    >
      <div className={[styles.wrap, "grid gap-10 lg:grid-cols-2 lg:items-center"].join(" ")}>
        <div className="space-y-4">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-primary-ink">
            A turma recebe junto
          </p>
          <h2
            id="turma-title"
            className="text-balance text-[30px] font-extrabold leading-tight tracking-tight sm:text-[40px]"
          >
            Uma família organiza o cartaz de provas, e a turma toda recebe.
          </h2>
          <p className="text-[16px] leading-relaxed text-foreground/80">
            Quando alguém da turma traz o calendário de provas para a Agenda, as outras famílias
            recebem as mesmas atividades e só aceitam. Se a escola mudar a data, quem mandou corrige
            para todo mundo. Quem vai cuidar, o lembrete e o que já foi feito continuam sendo só de
            cada casa.
          </p>
          <ul className="flex flex-wrap gap-2 text-sm font-bold">
            {["Receber é grátis", "Mandar para a turma é do Pro", "A turma entra por um link"].map(
              (item) => (
                <li
                  key={item}
                  className="rounded-full border border-foreground/15 bg-background px-3 py-1"
                >
                  {item}
                </li>
              ),
            )}
          </ul>
        </div>
        <div className="mx-auto grid w-full max-w-[420px] gap-3">
          <figure className="space-y-3 rounded-[20px] border border-foreground/15 bg-background p-4">
            <figcaption className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
              Família da Clara
            </figcaption>
            <p className="text-[16px] font-extrabold">Mandar 4 provas para a turma do 3º B?</p>
            <p className="text-sm text-muted-foreground">
              As outras famílias recebem e decidem se aceitam.
            </p>
            <p className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
              Mandar para a turma
            </p>
          </figure>
          <ArrowDown className="mx-auto size-5 text-muted-foreground" aria-hidden />
          <figure className="space-y-2 rounded-[20px] border border-foreground/15 bg-background p-4">
            <figcaption className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
              Outra família do 3º B · plano grátis
            </figcaption>
            <p className="text-[16px] font-extrabold">4 atividades da turma esperando você</p>
            <ul className="text-sm text-muted-foreground">
              <li>Prova de Português · qui, 22</li>
              <li>Prova de Matemática · ter, 27</li>
              <li>e mais 2</li>
            </ul>
            <p className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">
              Aceitar as 4
            </p>
          </figure>
        </div>
      </div>
    </section>
  );
}

import { Backpack } from "lucide-react";
import type { TodaySubjectsView } from "../today-subjects-service";

/**
 * "Na mochila de amanhã": as matérias do dia seguinte de cada criança.
 *
 * Sai de dado que já existe — o horário que a família cadastrou, com o
 * revezamento quinzenal aplicado — e responde a pergunta concreta das nove da
 * noite. Morava dentro do segundo bucket da rotina, abaixo dos KPIs e do
 * primeiro bucket, justamente na hora em que ela é feita.
 *
 * Agora tem dois lugares, e o dashboard escolhe pela hora: de dia continua no
 * bucket "preparar para amanhã", à noite sobe para o topo da página. Nada
 * aparece ou some por causa da hora — só troca de lugar.
 */
export function TomorrowBackpack({
  schedule,
  emphasis = false,
}: {
  schedule: TodaySubjectsView[];
  /** No topo da página ela é o assunto; dentro do bucket, um apoio. */
  emphasis?: boolean;
}) {
  const withClasses = schedule.filter((view) => view.subjects.length > 0);
  if (withClasses.length === 0) return null;

  return (
    <section
      aria-labelledby="tomorrow-backpack-title"
      className={
        emphasis
          ? "rounded-2xl border border-chart-1/30 bg-card p-5"
          : "rounded-2xl border border-chart-1/25 bg-chart-1/5 p-4"
      }
    >
      <h2
        id="tomorrow-backpack-title"
        className={
          emphasis
            ? "flex items-center gap-2 text-xl font-bold tracking-tight"
            : "flex items-center gap-2 text-sm font-semibold"
        }
      >
        <Backpack
          className={
            emphasis ? "size-6 shrink-0 text-chart-1-ink" : "size-4 shrink-0 text-chart-1-ink"
          }
          aria-hidden
        />
        Na mochila de amanhã
      </h2>
      <ul className={emphasis ? "mt-3 space-y-2" : "mt-2 space-y-1"}>
        {withClasses.map((view) => (
          <li key={view.profileId} className="break-words text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{view.profileName}:</span>{" "}
            {view.subjects.map((subject) => subject.name).join(" · ")}
          </li>
        ))}
      </ul>
      {emphasis ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Sai do horário que vocês cadastraram. Os materiais pedidos aparecem na rotina, abaixo.
        </p>
      ) : null}
    </section>
  );
}

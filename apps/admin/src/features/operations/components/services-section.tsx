import { ExternalLink } from "lucide-react";
import { Mono, Note, SectionTitle } from "@/components/blocks";
import { StatusPill } from "@/components/status";
import { formatRelative, formatTime } from "@/lib/format";
import { RAILWAY_PROJECT_URL } from "@/lib/links";
import { latencyText, SERVICE_STATE } from "../labels";
import type { OperationsView } from "../service";

function MigrationsCard({ migrations }: { migrations: OperationsView["migrations"] }) {
  const tone = migrations.ok ? "ok" : "bad";
  const label = migrations.ok
    ? "Concluídas"
    : migrations.reason === "behind"
      ? "Atrasadas"
      : "Sem acesso";
  return (
    <article className="grid content-start gap-2 rounded-[14px] border border-line-warm bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-base font-extrabold">Migrações do banco</h3>
        <StatusPill tone={tone}>{label}</StatusPill>
      </div>
      <p className="m-0 text-sm text-ink-soft">
        {migrations.ok ? (
          <>
            Última aplicada: <Mono>{migrations.applied ?? "nenhuma"}</Mono>
          </>
        ) : migrations.reason === "behind" ? (
          <>
            O banco está em <Mono>{migrations.applied ?? "nenhuma"}</Mono> e este código espera{" "}
            <Mono>{migrations.expected ?? "?"}</Mono>. O migrator precisa rodar.
          </>
        ) : (
          "O Bastidores não conseguiu ler a tabela de migrações agora."
        )}
      </p>
    </article>
  );
}

export function ServicesSection({ view, now }: { view: OperationsView; now: Date }) {
  return (
    <section aria-labelledby="servicos" className="grid gap-3">
      <SectionTitle id="servicos" aside={`conferidos às ${formatTime(view.checkedAt)}`}>
        Serviços
      </SectionTitle>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr))]">
        {view.services.map((service) => {
          const state = SERVICE_STATE[service.state];
          return (
            <article
              key={service.key}
              className={`grid content-start gap-2 rounded-[14px] border bg-surface p-4 ${
                service.state === "down" ? "border-[1.5px] border-bad" : "border-line-warm"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="m-0 text-base font-extrabold">{service.name}</h3>
                <StatusPill tone={state.tone}>{state.label}</StatusPill>
              </div>
              {service.problem ? (
                <p className="m-0 text-sm text-ink-soft">
                  {service.since
                    ? `Desde ${formatTime(service.since)} (${formatRelative(service.since, now)}): `
                    : "Agora: "}
                  {service.problem}.
                </p>
              ) : service.since ? (
                <p className="m-0 text-sm text-ink-muted">
                  {state.label} desde {formatTime(service.since)},{" "}
                  {formatRelative(service.since, now)}
                </p>
              ) : null}
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-ink-muted">Versão</dt>
                <dd className="m-0">
                  {service.commit ? (
                    <Mono>{service.commit}</Mono>
                  ) : service.key === "site" ? (
                    "não informa"
                  ) : (
                    "sem resposta"
                  )}
                </dd>
                <dt className="text-ink-muted">Banco</dt>
                <dd className="m-0">{service.database}</dd>
                <dt className="text-ink-muted">Resposta</dt>
                <dd className="m-0">
                  <Mono>{latencyText(service.latencyMs)}</Mono>
                </dd>
              </dl>
            </article>
          );
        })}
        <MigrationsCard migrations={view.migrations} />
      </div>
      <Note>
        Situação e banco vêm da rota /api/ready de cada app; a versão vem de /api/health, que
        responde mesmo quando o deploy vai mal. O "desde" vem da vigia, que confere a cada 5
        minutos.{" "}
        <a
          href={RAILWAY_PROJECT_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1 font-bold text-ink underline underline-offset-2"
        >
          Abrir o projeto no Railway
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only">(abre em outra aba)</span>
        </a>
      </Note>
    </section>
  );
}

import { ExternalLink } from "lucide-react";
import { Mono, Note, Panel, SectionTitle } from "@/components/blocks";
import { formatNumber } from "@/lib/format";
import { SENTRY_PAGE_LIMIT, type SentryOverview } from "../sentry";

function count(value: number | null) {
  if (value === null) return "indisponível";
  if (value >= SENTRY_PAGE_LIMIT) return `${SENTRY_PAGE_LIMIT} ou mais`;
  return formatNumber(value);
}

export function SentrySection({ sentry }: { sentry: SentryOverview }) {
  const linked = sentry.projects.filter((project) => project.url);
  return (
    <Panel labelledBy="sentry">
      <SectionTitle id="sentry" aside="erros abertos nos últimos 14 dias">
        Erros dos apps, pelo Sentry
      </SectionTitle>
      {sentry.configured ? (
        <ul className="m-0 grid list-none p-0">
          {sentry.projects.map((project) => (
            <li
              key={project.project}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2 first:border-t-0"
            >
              {project.url ? (
                <a
                  href={project.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 font-semibold text-ink underline underline-offset-2"
                >
                  {project.name}
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">(abre em outra aba)</span>
                </a>
              ) : (
                <span className="font-semibold">{project.name}</span>
              )}
              <Mono>{count(project.unresolved)}</Mono>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-ink-soft">
          Para ver aqui quantos erros estão abertos em cada app, o Bastidores precisa de
          SENTRY_ORG_SLUG e de um SENTRY_READ_TOKEN só de leitura. Até lá, o Sentry continua sendo o
          lugar.
        </p>
      )}
      {!sentry.configured && linked.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-x-4 p-0">
          {linked.map((project) => (
            <li key={project.project}>
              <a
                href={project.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink underline underline-offset-2"
              >
                {project.name}
                <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="sr-only">(abre em outra aba)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <Note>
        A contagem é guardada por 5 minutos. "Indisponível" quer dizer que o Sentry não respondeu,
        não que está zerado.
      </Note>
    </Panel>
  );
}

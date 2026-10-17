import type { Route } from "next";
import Link from "next/link";
import { Mono } from "@/components/blocks";
import { formatDateTime } from "@/lib/format";
import type { DescribedEvent, SentencePart } from "../humanize";

function partKey(part: SentencePart) {
  return part.kind === "text" ? `t:${part.text}` : `p:${part.id}`;
}

function Sentence({ parts }: { parts: readonly SentencePart[] }) {
  return (
    <>
      {parts.map((part) =>
        part.kind === "text" ? (
          <span key={partKey(part)}>{part.text}</span>
        ) : (
          <Link
            key={partKey(part)}
            href={`/pessoas/${encodeURIComponent(part.id)}` as Route}
            className="font-semibold text-ink underline underline-offset-2"
          >
            {part.name}
          </Link>
        ),
      )}
      .
    </>
  );
}

function Who({ actor }: { actor: DescribedEvent["actor"] }) {
  // Sistema e conta excluída não têm ficha para abrir.
  if (actor.kind === "system" || actor.kind === "deleted")
    return <span className="text-ink-soft">{actor.label}</span>;
  const name =
    actor.id !== null ? (
      <Link
        href={`/pessoas/${encodeURIComponent(actor.id)}` as Route}
        className="font-semibold text-ink underline-offset-2 hover:underline"
      >
        {actor.label}
      </Link>
    ) : (
      actor.label
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {actor.kind === "staff" ? (
        <span className="rounded-full bg-info-wash px-2 py-0.5 text-[12px] font-bold text-info">
          equipe
        </span>
      ) : null}
      {name}
    </span>
  );
}

export function AuditList({ rows }: { rows: DescribedEvent[] }) {
  return (
    <ol className="m-0 grid list-none rounded-[18px] border border-line-warm bg-surface p-0">
      {rows.map((row) => (
        <li
          key={row.id}
          className={`grid gap-1.5 border-t border-line-soft px-4 py-3 first:border-t-0 lg:grid-cols-[96px_200px_minmax(0,1fr)_minmax(0,260px)] lg:gap-4 ${
            row.team ? "bg-info-wash/50" : ""
          }`}
        >
          <Mono className="text-ink-muted">
            <time dateTime={row.createdAt.toISOString()}>{formatDateTime(row.createdAt)}</time>
          </Mono>
          <span className="text-sm">
            <Who actor={row.actor} />
          </span>
          <span className="text-[15px]">
            <Sentence parts={row.parts} />
          </span>
          <span className="grid gap-0.5 text-[12px] text-ink-muted">
            <Mono className="text-ink-soft">{row.eventType}</Mono>
            {row.fields.length ? (
              <span className="break-words">{row.fields.join(", ")}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

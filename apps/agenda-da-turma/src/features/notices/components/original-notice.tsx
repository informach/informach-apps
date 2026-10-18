import { dayMonthLabel, isLocalIsoDate } from "@/features/dashboard/day-labels";
import type { getNoticeSource } from "../repository";
import { SOURCE_LABELS } from "../schemas";

// Callers must fetch with getNoticeSource, which authorizes the entire original.
export function OriginalNotice({
  source,
  title = "Documento original",
}: {
  source: NonNullable<Awaited<ReturnType<typeof getNoticeSource>>>;
  /** No detalhe da atividade a pergunta é "de onde veio"; na página do recado, o próprio documento. */
  title?: string;
}) {
  return (
    <section className="space-y-3 rounded-[20px] border border-foreground/15 bg-background p-4 sm:p-5">
      <h2 className="text-lg font-extrabold tracking-tight">
        {title} · {SOURCE_LABELS[source.source]}
      </h2>
      {source.publishedAt ? (
        <p className="text-sm text-muted-foreground">
          {source.source === "notebook" ? "Anotado" : "Publicado"} em{" "}
          {isLocalIsoDate(source.publishedAt)
            ? dayMonthLabel(source.publishedAt)
            : source.publishedAt}
        </p>
      ) : null}
      {source.text ? (
        <p className="whitespace-pre-wrap break-words text-sm">{source.text}</p>
      ) : null}
      {source.sourceUrl ? (
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm text-primary-ink underline"
        >
          Abrir no aplicativo da escola
        </a>
      ) : null}
      {source.attachmentData &&
      source.attachmentExpiresAt &&
      source.attachmentExpiresAt > new Date() ? (
        <a
          href={`/api/recados/${source.id}/anexo`}
          className="block text-sm text-primary-ink underline"
        >
          Baixar anexo original: {source.attachmentName}
        </a>
      ) : source.attachmentName ? (
        <p className="text-sm text-muted-foreground">
          O arquivo original expirou após 30 dias. As atividades continuam disponíveis. Consulte a
          agenda, o caderno ou o aplicativo da escola.
        </p>
      ) : null}
    </section>
  );
}

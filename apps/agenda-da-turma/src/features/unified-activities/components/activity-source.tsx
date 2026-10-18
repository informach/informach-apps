import Link from "next/link";
import { todayLocalIso } from "@/features/dashboard/date";
import type { getNoticeSource } from "@/features/notices/repository";
import { SOURCE_LABELS } from "@/features/notices/schemas";
import { SHEET_LINK } from "./activity-list";

type NoticeSource = NonNullable<Awaited<ReturnType<typeof getNoticeSource>>>;

/** "15/10", o dia em que o recado chegou ou foi publicado. */
export function noticeDayLabel(source: Pick<NoticeSource, "publishedAt" | "createdAt">) {
  const iso = source.publishedAt ?? todayLocalIso(source.createdAt);
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/** Onde o recado estava, para a frase do quando: "Está no recado do Teams…". */
const SOURCE_PHRASE: Record<NoticeSource["source"], string> = {
  teams: "do Teams",
  batista: "do Batista ID",
  notebook: "da agenda ou do caderno",
  whatsapp: "do grupo do WhatsApp",
  other: "",
};

/** "Está no recado da agenda ou do caderno enviado em 15/10." */
export function noticeWhereSentence(source: NoticeSource) {
  const phrase = SOURCE_PHRASE[source.source];
  return `Está no recado${phrase ? ` ${phrase}` : ""} enviado em ${noticeDayLabel(source)}.`;
}

/**
 * "De onde veio", no detalhe: o canal e quem mandou, o trecho do recado que
 * virou esta atividade e até quando a foto fica guardada. O recado inteiro
 * mora a um toque, em "Ver o recado".
 */
export function ActivitySource({
  source,
  excerpt,
  senderName,
}: {
  source: NoticeSource;
  excerpt: string | null;
  /** O primeiro nome de quem mandou o recado, quando é um adulto da casa. */
  senderName: string | null;
}) {
  const image = source.attachmentType?.startsWith("image/") ?? false;
  const kept = source.attachmentExpiresAt && source.attachmentExpiresAt > new Date();
  const keptUntil = source.attachmentExpiresAt
    ? noticeDayLabel({ publishedAt: null, createdAt: source.attachmentExpiresAt })
    : null;

  return (
    <section
      aria-labelledby="activity-source-title"
      className="flex flex-col gap-3 rounded-[20px] border border-foreground/15 bg-background p-[18px]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="activity-source-title" className="text-[19px] font-bold tracking-[-0.01em]">
          De onde veio
        </h2>
        {source.status === "confirmed" ? (
          <Link href={`/recados/${source.id}`} className={SHEET_LINK}>
            Ver o recado
          </Link>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {SOURCE_LABELS[source.source]} ·{" "}
        {senderName
          ? `${senderName} mandou em ${noticeDayLabel(source)}`
          : `enviado em ${noticeDayLabel(source)}`}
      </p>
      {excerpt ? (
        <blockquote className="break-words rounded-xl border border-foreground/15 bg-background px-3.5 py-3 text-base leading-normal">
          “{excerpt}”
        </blockquote>
      ) : null}
      {source.sourceUrl ? (
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-bold text-primary-ink underline"
        >
          Abrir no aplicativo da escola
        </a>
      ) : null}
      {source.attachmentName ? (
        <p className="text-[13px] leading-[1.45] text-muted-foreground">
          {kept && keptUntil
            ? `${image ? "A foto fica guardada" : "O arquivo fica guardado"} até ${keptUntil}. A atividade continua depois disso.`
            : `${image ? "A foto já não está guardada" : "O arquivo já não está guardado"}. A atividade continua aqui.`}
        </p>
      ) : null}
    </section>
  );
}

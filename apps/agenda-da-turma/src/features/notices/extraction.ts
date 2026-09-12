import { type NoticeExtraction, noticeExtractionSchema } from "./schemas";

// The original excerpt is required for a school date. A publication date is
// context for relative expressions, never itself an implicit deadline.
export function validateNoticeExtraction(
  value: unknown,
  publishedAt: string | null,
): NoticeExtraction {
  const parsed = noticeExtractionSchema.parse(value);
  const reference = parsed.publicationReference;
  const referenceDate =
    reference && hasPublicationEvidence(reference.date, reference.sourceExcerpt)
      ? reference.date
      : null;
  const conflict = Boolean(publishedAt && referenceDate && publishedAt !== referenceDate);
  const publication = conflict ? null : (publishedAt ?? referenceDate);
  const missingReference = parsed.actions.some((a) => a.dateOrigin === "relative") && !publication;
  return {
    ...parsed,
    publicationReference: referenceDate ? reference : null,
    warnings: [
      ...parsed.warnings,
      ...(missingReference
        ? [
            conflict
              ? "A publicação informada diverge do original. Confirme a referência e os prazos antes de salvar."
              : "Há um prazo relativo sem referência de publicação confirmada. Informe a publicação e organize novamente, ou confirme a data da providência.",
          ]
        : []),
    ].slice(0, 10),
    actions: parsed.actions.map((action) => {
      if (
        !action.dueAt ||
        !action.sourceExcerpt?.trim() ||
        action.dateOrigin === "unspecified" ||
        (action.dateOrigin === "relative" && !publication)
      ) {
        return { ...action, dueAt: null, time: null, dateOrigin: "unspecified" as const };
      }
      return action;
    }),
  };
}

function hasPublicationEvidence(date: string, excerpt: string) {
  const references = [
    ...excerpt.matchAll(
      /(?:publicad[oa]|publica[cç][aã]o|enviad[oa]|data da mensagem)\s*(?:em\s*)?[:-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/gi,
    ),
  ].map((match) => {
    const written = match[1];
    if (!written) return null;
    if (!written.includes("/")) return written;
    const [day, month, year] = written.split("/");
    return day && month && year
      ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
      : null;
  });
  return references.length > 0 && references.every((reference) => reference === date);
}

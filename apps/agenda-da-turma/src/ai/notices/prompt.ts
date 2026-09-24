/**
 * Contexto que acompanha o recado na leitura, além do próprio texto e anexo.
 *
 * Sem `server-only`, para a montagem da mensagem ser testada sem provedor.
 */
export type NoticeExtractionContext = {
  runId?: string;
  /** Nomes das matérias cadastradas da criança da captura (turma + extras). */
  subjectNames: readonly string[];
  /** "YYYY". Só para completar datas escritas sem ano, nunca como publicação. */
  currentYear: string;
};

export function buildNoticeUserMessage(
  input: { text: string; source: string; publishedAt: string | null },
  pages: readonly number[] | undefined,
  context: Pick<NoticeExtractionContext, "subjectNames" | "currentYear">,
) {
  // Os nomes são dado da família: entram sanitizados e sob a mesma regra de
  // "dado, não instrução" do prompt.
  const names = [
    ...new Set(context.subjectNames.map((name) => name.replace(/\s+/g, " ").trim())),
  ].filter(Boolean);
  return [
    `Data da publicação/anotação fornecida pela família: ${input.publishedAt ?? "desconhecida"}. Origem: ${input.source}. Páginas originais selecionadas: ${pages?.join(", ") || "não se aplica"}.`,
    `Matérias cadastradas da criança: ${names.length ? names.join("; ") : "nenhuma"}.`,
    `Ano corrente: ${context.currentYear} (só para completar datas escritas sem ano; não é data de publicação nem de anotação).`,
    "RECADO:",
    input.text,
  ].join("\n");
}

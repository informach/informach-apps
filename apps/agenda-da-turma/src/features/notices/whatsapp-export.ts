/**
 * Lê o arquivo que o WhatsApp exporta ("Exportar conversa", sem mídia).
 *
 * O recado da escola chega no grupo da turma, e hoje a família precisa achar a
 * mensagem, marcar, copiar e colar — no meio de duzentas mensagens sobre outra
 * coisa. Exportar a conversa e escolher as mensagens numa lista é o mesmo ato
 * com menos garimpo.
 *
 * Puro e sem rede: o arquivo é lido no navegador e nada sai dali até a pessoa
 * escolher as mensagens. O conteúdo do grupo inteiro nunca vai para a IA — só
 * o que ela marcar.
 */
export type WhatsAppMessage = {
  /** "YYYY-MM-DD" da mensagem, quando a linha traz data válida. */
  dateIso: string | null;
  time: string | null;
  author: string | null;
  text: string;
};

/**
 * iOS: `[27/09/2026, 18:43:34] Fulano: mensagem`
 * Android: `27/09/2026 18:43 - Fulano: mensagem`
 *
 * O ano com dois dígitos aparece nos dois: `27/09/26`.
 */
const HEADER =
  /^‎?\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?\]?\s*(?:-\s*)?(.*)$/;

/** Linhas que o WhatsApp escreve sozinho: não são recado de ninguém. */
const SYSTEM_MARKERS = [
  "as mensagens e as chamadas são protegidas",
  "messages and calls are end-to-end encrypted",
  "criou este grupo",
  "criou o grupo",
  "adicionou",
  "saiu do grupo",
  "removeu",
  "mudou o assunto",
  "mudou a descrição",
  "mudou o ícone",
  "entrou usando o link",
  "esta mensagem foi apagada",
  "você foi adicionado",
];
/** Anexo não exportado: a linha existe, o arquivo não. */
const ATTACHMENT_MARKERS = ["<anexado:", "<attached:", "arquivo de mídia oculto", "media omitted"];

function toIso(day: string, month: string, year: string): string | null {
  const y = year.length === 2 ? 2000 + Number(year) : Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
}

const isNoise = (text: string) => {
  const lower = text.toLowerCase();
  return (
    SYSTEM_MARKERS.some((marker) => lower.includes(marker)) ||
    ATTACHMENT_MARKERS.some((marker) => lower.includes(marker))
  );
};

export function parseWhatsAppExport(content: string, options: { limit?: number } = {}) {
  const limit = options.limit ?? 2000;
  const messages: WhatsAppMessage[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/‎|‏/g, "");
    const header = HEADER.exec(line);
    if (!header) {
      // Continuação da mensagem anterior: o WhatsApp quebra linha sem repetir
      // o cabeçalho, e perder isso cortaria o recado no meio.
      const last = messages[messages.length - 1];
      if (last && line.trim()) last.text = `${last.text}\n${line.trim()}`.slice(0, 4000);
      continue;
    }
    const [, day, month, year, time, rest = ""] = header;
    if (!day || !month || !year || !time) continue;
    const separator = rest.indexOf(": ");
    const author = separator > 0 ? rest.slice(0, separator).trim() : null;
    const text = (separator > 0 ? rest.slice(separator + 2) : rest).trim();
    if (!text || isNoise(text)) continue;
    messages.push({ dateIso: toIso(day, month, year), time, author, text });
    if (messages.length >= limit) break;
  }
  return messages;
}

/**
 * Monta o texto que vai para a leitura, com a data de cada mensagem à vista.
 *
 * A data importa: um "entregar amanhã" de uma mensagem de terça não é o mesmo
 * que o de hoje, e a regra de prazo relativo depende de uma referência de
 * publicação inequívoca.
 */
export function buildNoticeTextFromMessages(messages: readonly WhatsAppMessage[]): string {
  return messages
    .map((message) => {
      const date = message.dateIso ? message.dateIso.split("-").reverse().join("/") : null;
      const head = [date && `Mensagem de ${date}`, message.time, message.author]
        .filter(Boolean)
        .join(" · ");
      return head ? `${head}:\n${message.text}` : message.text;
    })
    .join("\n\n");
}

/** A data da mensagem mais recente entre as escolhidas: a publicação do recado. */
export function latestMessageDate(messages: readonly WhatsAppMessage[]): string | null {
  return messages.reduce<string | null>(
    (latest, message) =>
      message.dateIso && (!latest || message.dateIso > latest) ? message.dateIso : latest,
    null,
  );
}

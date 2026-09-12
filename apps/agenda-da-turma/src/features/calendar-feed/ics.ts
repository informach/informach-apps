export type FeedEvent = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time?: string | null;
  location?: string | null;
  updatedAt: Date;
  version?: number;
  canceled?: boolean;
};
export function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}
export function foldIcsLine(line: string) {
  let current = "";
  let bytes = 0;
  const parts: string[] = [];
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) {
      parts.push(current);
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n");
}
function stamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
export function buildCalendarFeed(events: FeedEvent[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Informach//Agenda da Turma//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Agenda da Turma",
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcs(event.id)}@agenda-da-turma`,
      `DTSTAMP:${stamp(event.updatedAt)}`,
      `LAST-MODIFIED:${stamp(event.updatedAt)}`,
      `SEQUENCE:${event.version ?? 0}`,
    );
    if (event.time)
      lines.push(`DTSTART:${stamp(new Date(`${event.date}T${event.time}:00-03:00`))}`);
    else {
      const end = new Date(`${event.date}T12:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      lines.push(
        `DTSTART;VALUE=DATE:${event.date.replace(/-/g, "")}`,
        `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}`,
      );
    }
    lines.push(
      `SUMMARY:${escapeIcs(event.title)}`,
      `STATUS:${event.canceled ? "CANCELLED" : "CONFIRMED"}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

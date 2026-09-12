import { describe, expect, it } from "vitest";
import { buildCalendarFeed, escapeIcs, foldIcsLine } from "./ics";

describe("private calendar format", () => {
  it("escapes content so a title cannot inject an event", () => {
    expect(escapeIcs("A,B;C\\D\nEND:VEVENT")).toBe("A\\,B\\;C\\\\D\\nEND:VEVENT");
  });
  it("folds UTF-8 at 75 octets without breaking characters", () => {
    const title = `SUMMARY:${"Autorização 🎒 ".repeat(20)}`;
    const folded = foldIcsLine(title);
    expect(folded.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(title);
  });
  it("keeps event identity across rescheduling and cancellation", () => {
    const event = {
      id: "same-event",
      title: "Passeio",
      description: null,
      date: "2026-09-18",
      updatedAt: new Date("2026-09-11T12:00:00Z"),
    };
    const original = buildCalendarFeed([event]);
    const changed = buildCalendarFeed([
      { ...event, date: "2026-09-21", version: 2, canceled: true },
    ]);
    expect(original).toContain("UID:same-event@agenda-da-turma");
    expect(changed).toContain("UID:same-event@agenda-da-turma");
    expect(changed).toContain("SEQUENCE:2\r\n");
    expect(changed).toContain("STATUS:CANCELLED");
    expect(changed).toContain("DTEND;VALUE=DATE:20260922");
  });
  it("converts a specified Brasília time without adding a fictional duration", () => {
    const output = buildCalendarFeed([
      {
        id: "timed",
        title: "Reunião",
        description: null,
        date: "2026-09-18",
        time: "08:00",
        updatedAt: new Date(),
      },
    ]);
    expect(output).toContain("DTSTART:20260918T110000Z");
    expect(output).not.toContain("DTEND");
  });
});

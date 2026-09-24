import { describe, expect, it } from "vitest";
import {
  buildNoticeTextFromMessages,
  latestMessageDate,
  parseWhatsAppExport,
} from "./whatsapp-export";

const ios = `[26/09/2026, 07:12:03] Coordenação: Bom dia!
[27/09/2026, 18:43:34] Profa. Marina: Prova de Ciências em 02/10.
Estudar capítulos 4 e 5.
[27/09/2026, 18:44:00] Mãe da Bia: Obrigada!`;

const android = `26/09/2026 07:12 - Coordenação: Bom dia!
27/09/2026 18:43 - Profa. Marina: Prova de Ciências em 02/10.`;

describe("parseWhatsAppExport", () => {
  it("reads the iOS format, keeping multi-line messages whole", () => {
    const messages = parseWhatsAppExport(ios);
    expect(messages).toHaveLength(3);
    expect(messages[1]).toMatchObject({
      dateIso: "2026-09-27",
      time: "18:43",
      author: "Profa. Marina",
    });
    expect(messages[1]?.text).toBe("Prova de Ciências em 02/10.\nEstudar capítulos 4 e 5.");
  });
  it("reads the Android format", () => {
    const messages = parseWhatsAppExport(android);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ dateIso: "2026-09-27", author: "Profa. Marina" });
  });
  it("accepts two-digit years and rejects impossible dates", () => {
    expect(parseWhatsAppExport("27/09/26 18:43 - X: oi")[0]?.dateIso).toBe("2026-09-27");
    expect(parseWhatsAppExport("31/02/2026 18:43 - X: oi")[0]?.dateIso).toBeNull();
  });
  it("drops what WhatsApp wrote by itself and attachments that did not come", () => {
    const noise = `26/09/2026 07:00 - As mensagens e as chamadas são protegidas com criptografia
26/09/2026 07:01 - Fulano criou este grupo
26/09/2026 07:02 - Fulano adicionou Beltrano
26/09/2026 07:03 - Profa: <anexado: IMG-0001.jpg>
26/09/2026 07:04 - Profa: Prova na sexta.`;
    const messages = parseWhatsAppExport(noise);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe("Prova na sexta.");
  });
  it("respects the message cap", () => {
    const many = Array.from(
      { length: 50 },
      (_, i) => `26/09/2026 07:0${i % 10} - A: msg ${i}`,
    ).join("\n");
    expect(parseWhatsAppExport(many, { limit: 10 })).toHaveLength(10);
  });
});

describe("buildNoticeTextFromMessages", () => {
  it("keeps each message's date in sight for the reading", () => {
    const text = buildNoticeTextFromMessages(parseWhatsAppExport(android));
    expect(text).toContain("Mensagem de 27/09/2026 · 18:43 · Profa. Marina:");
    expect(text).toContain("Prova de Ciências em 02/10.");
  });
  it("finds the most recent date among the chosen messages", () => {
    expect(latestMessageDate(parseWhatsAppExport(ios))).toBe("2026-09-27");
    expect(latestMessageDate([])).toBeNull();
  });
});

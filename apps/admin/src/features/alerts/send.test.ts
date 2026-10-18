import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());
const report = vi.hoisted(() => vi.fn());

vi.mock("@/lib/emails", () => ({
  emailUnsubscribeUrl: (email: string) => `https://admin.example.test/u?e=${email}`,
  getEmails: () => ({ sendEmail }),
  ownerEmails: async () => [],
}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ ADMIN_ALERT_EMAILS: [] }) }));
vi.mock("@/lib/observability", () => ({ reportOperationalError: report }));

import { attemptMessageKey, sendToAll, UNKNOWN_RESEND_LIMIT } from "./send";

const render = async () => ({ html: "<p>x</p>", text: "x", subject: "Cozya está fora do ar" });

function send(recipients: string[]) {
  return sendToAll({
    category: "admin.alert",
    recipients,
    messageKey: (key) => `admin.alert:test:${key}`,
    render,
  });
}

beforeEach(() => {
  sendEmail.mockReset();
  report.mockReset();
});

describe("envio dos avisos do Bastidores", () => {
  it("envio pulado não conta como enviado", async () => {
    sendEmail
      .mockResolvedValueOnce({ ok: true, status: "sent", deliveryId: "d1" })
      .mockResolvedValueOnce({
        ok: false,
        status: "skipped",
        deliveryId: "d2",
        reason: "recipient suppressed: bounce",
      });
    const result = await send(["a@example.test", "b@example.test"]);
    expect(result).toEqual({ delivered: true, sent: 1, skipped: 1, failed: 0 });
  });

  it("ninguém recebeu quando todo mundo foi pulado, sem nada para tentar de novo", async () => {
    sendEmail.mockResolvedValue({ ok: false, status: "skipped", deliveryId: "d", reason: "x" });
    const result = await send(["a@example.test", "b@example.test"]);
    expect(result).toEqual({ delivered: true, sent: 0, skipped: 2, failed: 0 });
  });

  it("falha e envio adiado ficam para a próxima rodada", async () => {
    sendEmail
      .mockResolvedValueOnce({ ok: false, status: "failed", deliveryId: "d1", reason: "x" })
      .mockResolvedValueOnce({
        ok: false,
        status: "deferred",
        deliveryId: "d2",
        reason: "in-flight",
      })
      .mockResolvedValueOnce({ ok: true, status: "already-sent", deliveryId: "d3" });
    const result = await send(["a@example.test", "b@example.test", "c@example.test"]);
    expect(result).toEqual({ delivered: false, sent: 1, skipped: 0, failed: 2 });
  });
});

describe("aviso preso em desfecho desconhecido", () => {
  const unknown = {
    ok: false,
    status: "deferred",
    deliveryId: "d-unknown",
    reason: "outcome-unknown",
  } as const;
  const keysSent = () => sendEmail.mock.calls.map(([input]) => input.messageKey);

  it("tenta a mesma mensagem com a chave seguinte e conta como enviado", async () => {
    sendEmail
      .mockResolvedValueOnce(unknown)
      .mockResolvedValueOnce({ ok: true, status: "sent", deliveryId: "d2" });
    const result = await send(["a@example.test"]);
    expect(result).toEqual({ delivered: true, sent: 1, skipped: 0, failed: 0 });
    const [first, second] = keysSent();
    expect(second).toBe(`${first}:reenvio-1`);
  });

  it("não repete o que já saiu: a corrente para na primeira chave enviada", async () => {
    // Passada seguinte: a original continua desconhecida, a primeira reenviada já saiu.
    sendEmail
      .mockResolvedValueOnce(unknown)
      .mockResolvedValueOnce({ ok: true, status: "already-sent", deliveryId: "d2" });
    expect(await send(["a@example.test"])).toEqual({
      delivered: true,
      sent: 1,
      skipped: 0,
      failed: 0,
    });
    expect(sendEmail).toHaveBeenCalledTimes(2);

    // O aceite do SendGrid chegou para a original: nenhuma chave nova.
    sendEmail.mockReset();
    sendEmail.mockResolvedValueOnce({ ok: true, status: "already-sent", deliveryId: "d1" });
    expect((await send(["a@example.test"])).sent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("envio ainda em andamento espera a próxima passada, sem chave nova", async () => {
    sendEmail.mockResolvedValueOnce({
      ok: false,
      status: "deferred",
      deliveryId: "d1",
      reason: "in-flight",
    });
    expect(await send(["a@example.test"])).toEqual({
      delivered: false,
      sent: 0,
      skipped: 0,
      failed: 1,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("para no limite de reenvios e deixa o aviso pendente", async () => {
    sendEmail.mockResolvedValue(unknown);
    expect(await send(["a@example.test"])).toEqual({
      delivered: false,
      sent: 0,
      skipped: 0,
      failed: 1,
    });
    expect(sendEmail).toHaveBeenCalledTimes(UNKNOWN_RESEND_LIMIT + 1);
    expect(keysSent().at(-1)).toBe(attemptMessageKey(keysSent()[0] ?? "", UNKNOWN_RESEND_LIMIT));
  });
});

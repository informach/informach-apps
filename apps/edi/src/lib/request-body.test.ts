import { describe, expect, it } from "vitest";
import { InvalidRequestBodyError, PayloadTooLargeError, readRequestBody } from "./request-body";

describe("bounded request bodies", () => {
  it("decodes valid UTF-8 and classifies invalid bytes as input errors", async () => {
    await expect(
      readRequestBody(
        new Request("https://edi.test", { method: "POST", body: '{"x":"ação"}' }),
        64,
      ),
    ).resolves.toBe('{"x":"ação"}');
    await expect(
      readRequestBody(
        new Request("https://edi.test", { method: "POST", body: new Uint8Array([255]) }),
        64,
      ),
    ).rejects.toBeInstanceOf(InvalidRequestBodyError);
  });
  it("bounds actual streaming bytes, cancels consumption and releases the reader", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10));
      },
      cancel() {
        cancelled = true;
      },
    });
    const init = { method: "POST", body, duplex: "half" };
    const request = new Request("https://edi.test", init);
    await expect(readRequestBody(request, 5)).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(cancelled).toBe(true);
    expect(request.body?.locked).toBe(false);
  });
  it("preserves the size classification and cleanup cause when cancellation fails", async () => {
    const cleanupFailure = new Error("Cancellation failed");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10));
      },
      cancel() {
        throw cleanupFailure;
      },
    });
    const init = { method: "POST", body, duplex: "half" };
    const request = new Request("https://edi.test", init);
    try {
      await readRequestBody(request, 5);
      expect.fail("The oversized request must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadTooLargeError);
      if (!(error instanceof PayloadTooLargeError)) throw error;
      expect(error.cause).toBeInstanceOf(AggregateError);
      if (!(error.cause instanceof AggregateError)) throw error;
      expect(error.cause.errors).toContain(cleanupFailure);
    }
    expect(request.body?.locked).toBe(false);
  });
  it("does not disguise transport failures as malformed input", async () => {
    const failure = new Error("Transport interrupted");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(failure);
      },
    });
    const init = { method: "POST", body, duplex: "half" };
    await expect(readRequestBody(new Request("https://edi.test", init), 64)).rejects.toBe(failure);
  });
  it("checks declared sizes and rejects invalid internal limits", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const init = { method: "POST", headers: { "Content-Length": "100" }, body, duplex: "half" };
    const request = new Request("https://edi.test", init);
    await expect(readRequestBody(request, 5)).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(cancelled).toBe(true);
    expect(request.body?.locked).toBe(false);
    await expect(readRequestBody(new Request("https://edi.test"), 0)).rejects.toBeInstanceOf(
      RangeError,
    );
  });
});

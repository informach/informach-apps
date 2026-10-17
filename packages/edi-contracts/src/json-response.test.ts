import { describe, expect, it } from "vitest";
import { InvalidJsonResponseError, readBoundedJson } from "./json-response";

describe("bounded protocol JSON", () => {
  it("decodes complete UTF-8 even when characters span stream chunks", async () => {
    const bytes = new TextEncoder().encode('{"text":"ação"}');
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
    );
    expect(await readBoundedJson(response, bytes.length)).toEqual({ text: "ação" });
    expect(response.body?.locked).toBe(false);
  });
  it("cancels oversized declared and streamed bodies, even with a misleading content length", async () => {
    let cancellations = 0;
    const body = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(33));
        },
        cancel() {
          cancellations++;
        },
      });
    await expect(
      readBoundedJson(new Response(body(), { headers: { "content-length": "33" } }), 32),
    ).rejects.toThrow("Oversized");
    const streamed = new Response(body(), { headers: { "content-length": "1" } });
    await expect(readBoundedJson(streamed, 32)).rejects.toThrow("Oversized");
    expect(cancellations).toBe(2);
    expect(streamed.body?.locked).toBe(false);
  });
  it("classifies malformed JSON and UTF-8 as invalid protocol data, not network failures", async () => {
    for (const bytes of [
      new TextEncoder().encode("{"),
      new Uint8Array([123, 34, 120, 34, 58, 34, 255, 34, 125]),
    ])
      await expect(readBoundedJson(new Response(bytes), 100)).rejects.toBeInstanceOf(
        InvalidJsonResponseError,
      );
    await expect(readBoundedJson(new Response(null), 100)).rejects.toThrow("Missing");
  });
  it("preserves the original network error and releases an errored stream", async () => {
    const failure = new TypeError("Connection interrupted");
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(failure);
        },
      }),
    );
    await expect(readBoundedJson(response, 100)).rejects.toBe(failure);
    expect(response.body?.locked).toBe(false);
  });
  it("retains malformed-data and distinct cancellation errors instead of hiding either", async () => {
    const cleanup = new Error("Cancellation failed");
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(33));
        },
        cancel() {
          throw cleanup;
        },
      }),
    );
    const failure = await readBoundedJson(response, 32).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error("Expected both failure causes");
    expect(failure.errors[0]).toBeInstanceOf(InvalidJsonResponseError);
    expect(failure.errors[1]).toBe(cleanup);
    expect(response.body?.locked).toBe(false);
  });
});

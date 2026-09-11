import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  contentLengthExceeds,
  RequestTooLargeError,
  readLimitedFormData,
  readLimitedJson,
} from "./request-size";

function streamedRequest(bytes: Uint8Array, contentLength?: string) {
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  return new Request("https://app.example.com", {
    method: "POST",
    headers: contentLength ? { "Content-Length": contentLength } : {},
    body: stream,
    ...{ duplex: "half" },
  });
}

describe("streamed body limits", () => {
  it("rejects a chunked body with missing or falsely small content length", async () => {
    const bytes = new TextEncoder().encode('{"name":"açúcar"}');
    for (const header of [undefined, "1"])
      await expect(readLimitedJson(streamedRequest(bytes, header), 8)).rejects.toBeInstanceOf(
        RequestTooLargeError,
      );
  });
  it("preserves UTF-8 characters split across chunks and accepts the exact byte limit", async () => {
    const bytes = new TextEncoder().encode('{"name":"açúcar"}');
    await expect(readLimitedJson(streamedRequest(bytes), bytes.length)).resolves.toEqual({
      name: "açúcar",
    });
  });
  it("limits multipart bytes before decoding the upload", async () => {
    const form = new FormData();
    form.set("audio", new Blob(["1234567890"]), "audio.webm");
    const encoded = new Request("https://app.example.com", { method: "POST", body: form });
    const request = new Request("https://app.example.com", {
      method: "POST",
      headers: encoded.headers,
      body: await encoded.arrayBuffer(),
    });
    await expect(readLimitedFormData(request, 9)).rejects.toBeInstanceOf(RequestTooLargeError);
  });
});

describe("contentLengthExceeds", () => {
  it("returns true when content-length is larger than the limit", () => {
    const request = new Request("https://app.example.com", {
      headers: { "content-length": "1025" },
    });

    expect(contentLengthExceeds(request, 1024)).toBe(true);
  });

  it("returns false for missing, invalid, or allowed content-length", () => {
    expect(contentLengthExceeds(new Request("https://app.example.com"), 1024)).toBe(false);
    expect(
      contentLengthExceeds(
        new Request("https://app.example.com", { headers: { "content-length": "invalid" } }),
        1024,
      ),
    ).toBe(false);
    expect(
      contentLengthExceeds(
        new Request("https://app.example.com", { headers: { "content-length": "1024" } }),
        1024,
      ),
    ).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "../transcription";

describe("transcribeAudio (OpenRouter — JSON+base64 via fetch)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function okResponse(text: string, extra: Record<string, unknown> = {}): Response {
    return new Response(JSON.stringify({ text, ...extra }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  function firstFetchCall(): [string, RequestInit] {
    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    if (!call) throw new Error("fetch was not called");
    return call;
  }

  function firstFetchBody(): Record<string, unknown> {
    return JSON.parse(String(firstFetchCall()[1].body)) as Record<string, unknown>;
  }

  it("POSTs application/json with input_audio (data+format), model and language", async () => {
    fetchMock.mockResolvedValue(okResponse("macarrão"));

    const audio = new Uint8Array([1, 2, 3]);
    const out = await transcribeAudio({
      apiKey: "sk-or-test",
      audio,
      language: "pt",
      format: "webm",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = firstFetchCall();
    expect(url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sk-or-test",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(firstFetchBody()).toEqual({
      input_audio: { data: Buffer.from(audio).toString("base64"), format: "webm" },
      model: "openai/whisper-1",
      language: "pt",
    });
    expect(out).toEqual({ text: "macarrão" });
  });

  it("forwards OpenRouter attribution headers without overriding required headers", async () => {
    fetchMock.mockResolvedValue(okResponse("ok"));

    await transcribeAudio({
      apiKey: "sk-or-test",
      audio: new Uint8Array([1]),
      format: "wav",
      headers: {
        "HTTP-Referer": "https://cozya.app",
        "X-OpenRouter-Title": "Cozya",
        Authorization: "Bearer wrong",
        "Content-Type": "text/plain",
      },
    });

    expect(firstFetchCall()[1].headers).toMatchObject({
      "HTTP-Referer": "https://cozya.app",
      "X-OpenRouter-Title": "Cozya",
      Authorization: "Bearer sk-or-test",
      "Content-Type": "application/json",
    });
  });

  it("returns durationInSeconds from OpenRouter usage.seconds when present", async () => {
    fetchMock.mockResolvedValue(okResponse("ok", { usage: { seconds: 3.25 } }));

    const out = await transcribeAudio({
      apiKey: "sk-or-test",
      audio: new Uint8Array([1]),
      format: "wav",
    });

    expect(out).toEqual({ text: "ok", durationInSeconds: 3.25 });
  });

  it("respects custom baseURL (e.g. self-hosted gateway), strips trailing slash", async () => {
    fetchMock.mockResolvedValue(okResponse("ok"));

    await transcribeAudio({
      apiKey: "k",
      baseURL: "https://gw.example.com/v1/",
      audio: new Uint8Array([1]),
      format: "wav",
    });

    expect(firstFetchCall()[0]).toBe("https://gw.example.com/v1/audio/transcriptions");
  });

  it("respects model override (default is openai/whisper-1)", async () => {
    fetchMock.mockResolvedValue(okResponse("ok"));

    await transcribeAudio({
      apiKey: "k",
      audio: new Uint8Array([1]),
      format: "wav",
      model: "openai/whisper-large-v3",
    });

    expect(firstFetchBody().model).toBe("openai/whisper-large-v3");
  });

  it("infers format from Blob.type (audio/webm;codecs=opus → webm)", async () => {
    fetchMock.mockResolvedValue(okResponse("ok"));

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm;codecs=opus" });
    await transcribeAudio({ apiKey: "k", audio: blob });

    expect((firstFetchBody().input_audio as { format: unknown }).format).toBe("webm");
  });

  it("falls back to format='webm' when Blob has no type and no explicit format", async () => {
    fetchMock.mockResolvedValue(okResponse("ok"));

    await transcribeAudio({ apiKey: "k", audio: new Blob([new Uint8Array([1])]) });

    expect((firstFetchBody().input_audio as { format: unknown }).format).toBe("webm");
  });

  it("omits language when not provided", async () => {
    fetchMock.mockResolvedValue(okResponse("ok"));

    await transcribeAudio({ apiKey: "k", audio: new Uint8Array(), format: "wav" });

    const body = firstFetchBody();
    expect(body).not.toHaveProperty("language");
  });

  it("forwards prompt in the body when provided", async () => {
    fetchMock.mockResolvedValue(okResponse("frango"));

    await transcribeAudio({
      apiKey: "k",
      audio: new Uint8Array([1]),
      format: "wav",
      language: "pt",
      prompt: "Ingredientes brasileiros: frango, arroz, feijão.",
    });

    expect(firstFetchBody().prompt).toBe("Ingredientes brasileiros: frango, arroz, feijão.");
  });

  it("omits prompt when not provided", async () => {
    fetchMock.mockResolvedValue(okResponse("ok"));

    await transcribeAudio({ apiKey: "k", audio: new Uint8Array(), format: "wav" });

    const body = firstFetchBody();
    expect(body).not.toHaveProperty("prompt");
  });

  it("throws with status code and body snippet when OpenRouter returns non-2xx", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":{"message":"unauthorized"}}', { status: 401 }),
    );

    await expect(
      transcribeAudio({ apiKey: "k", audio: new Uint8Array([1]), format: "wav" }),
    ).rejects.toThrow(/OpenRouter transcription failed \(401\)/);
  });

  it("throws when OpenRouter returns 200 but no text field", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ usage: {} }), { status: 200 }));

    await expect(
      transcribeAudio({ apiKey: "k", audio: new Uint8Array([1]), format: "wav" }),
    ).rejects.toThrow(/missing 'text' field/);
  });
});

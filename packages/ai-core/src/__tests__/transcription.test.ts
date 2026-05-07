import { describe, expect, it, vi } from "vitest";

const transcribeMock = vi.hoisted(() => vi.fn());
const createOpenAIMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({
  experimental_transcribe: transcribeMock,
}));

vi.mock("../providers", () => ({
  createOpenAI: createOpenAIMock,
}));

import { transcribeAudio } from "../transcription";

describe("transcribeAudio", () => {
  it("calls experimental_transcribe with the configured provider and language", async () => {
    const transcriptionModel = { id: "openai/whisper-1" };
    const provider = {
      transcription: vi.fn().mockReturnValue(transcriptionModel),
    };
    createOpenAIMock.mockReturnValue(provider);
    transcribeMock.mockResolvedValue({
      text: "macarrão",
      durationInSeconds: 1.4,
      language: "pt",
    });

    const audio = new Uint8Array([1, 2, 3]);
    const out = await transcribeAudio({ openaiApiKey: "sk-test", audio, language: "pt" });

    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: "sk-test" });
    expect(provider.transcription).toHaveBeenCalledWith("whisper-1");
    expect(transcribeMock).toHaveBeenCalledWith({
      model: transcriptionModel,
      audio,
      providerOptions: { openai: { language: "pt" } },
    });
    expect(out).toEqual({ text: "macarrão", durationInSeconds: 1.4, language: "pt" });
  });

  it("omits providerOptions when no language is provided", async () => {
    const provider = { transcription: vi.fn().mockReturnValue({}) };
    createOpenAIMock.mockReturnValue(provider);
    transcribeMock.mockResolvedValue({ text: "hello" });

    await transcribeAudio({ openaiApiKey: "sk-test", audio: new Uint8Array() });

    expect(transcribeMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ providerOptions: expect.anything() }),
    );
  });

  it("uses the model override when provided", async () => {
    const provider = { transcription: vi.fn().mockReturnValue({}) };
    createOpenAIMock.mockReturnValue(provider);
    transcribeMock.mockResolvedValue({ text: "" });

    await transcribeAudio({
      openaiApiKey: "sk-test",
      audio: new Uint8Array(),
      model: "whisper-1",
    });

    expect(provider.transcription).toHaveBeenCalledWith("whisper-1");
  });
});

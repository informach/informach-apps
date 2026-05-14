import { describe, expect, it, vi } from "vitest";
import {
  RequestBodyTooLargeError,
  readFormDataWithSizeLimit,
  readJsonWithSizeLimit,
  readRequestBodyWithSizeLimit,
} from "./request-size";

vi.mock("server-only", () => ({}));

describe("request-size", () => {
  it("parses JSON while enforcing byte limits without relying on Content-Length", async () => {
    const request = new Request("https://agenda.test/api/ai/subjects/parse-voice", {
      body: JSON.stringify({ transcript: "matematica" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    await expect(readJsonWithSizeLimit(request, 1024)).resolves.toEqual({
      transcript: "matematica",
    });
  });

  it("rejects bodies that exceed the streaming byte limit", async () => {
    const request = new Request("https://agenda.test/api/ai/subjects/parse-voice", {
      body: JSON.stringify({ transcript: "x".repeat(64) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    await expect(readRequestBodyWithSizeLimit(request, 16)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("parses FormData after buffering within the byte limit", async () => {
    const body = new FormData();
    body.append("audio", new Blob(["abc"], { type: "audio/webm" }), "audio.webm");

    const request = new Request("https://agenda.test/api/ai/transcribe", {
      body,
      method: "POST",
    });

    const form = await readFormDataWithSizeLimit(request, 4096);
    const audio = form.get("audio");

    expect(audio).toBeInstanceOf(Blob);
    expect((audio as Blob).size).toBe(3);
  });
});

import { describe, expect, it } from "vitest";
import { claudeArgs, codexArgs } from "./ai-args.ts";
import {
  checkTurnImages,
  claudeImageMessage,
  imageExtension,
  sniffImageType,
  TURN_IMAGE_BYTES,
  TURN_IMAGE_LIMIT,
} from "./ai-images.ts";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const server = { name: "edisvg", tokenEnv: "EDISVG_MCP_TOKEN" };

describe("reference images", () => {
  it("are accepted only when the bytes are the image their type says", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(webp)).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg/>"))).toBeUndefined();
    expect(checkTurnImages(undefined)).toEqual([]);
    expect(checkTurnImages([{ mediaType: "image/png", data: png }])).toHaveLength(1);
    expect(() => checkTurnImages([{ mediaType: "image/jpeg", data: png }])).toThrow(/PNG, JPEG/);
    expect(() => checkTurnImages([{ mediaType: "image/png", data: new Uint8Array() }])).toThrow(
      /vazia/,
    );
    const big = new Uint8Array(TURN_IMAGE_BYTES + 1);
    big.set(png);
    expect(() => checkTurnImages([{ mediaType: "image/png", data: big }])).toThrow(/grande/);
    const many = Array.from({ length: TURN_IMAGE_LIMIT + 1 }, () => ({
      mediaType: "image/png" as const,
      data: png,
    }));
    expect(() => checkTurnImages(many)).toThrow(/no máximo/);
  });

  it("reach Claude Code as one stream-json message on standard input, never in its arguments", () => {
    const line = claudeImageMessage("faça igual", [{ mediaType: "image/png", data: png }]);
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual({
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: Buffer.from(png).toString("base64"),
            },
          },
          { type: "text", text: "faça igual" },
        ],
      },
    });
    const args = claudeArgs({
      server,
      mcpConfig: "{}",
      systemPrompt: "guia",
      input: "stream-json",
    });
    expect(args[args.indexOf("--input-format") + 1]).toBe("stream-json");
    const text = claudeArgs({ server, mcpConfig: "{}", systemPrompt: "guia" });
    expect(text[text.indexOf("--input-format") + 1]).toBe("text");
  });

  it("reach Codex as files, each --image followed by an option, never by stdin's - or resume", () => {
    const fresh = codexArgs({ server, url: "u", workspace: "w", images: ["C:\ta.png"] });
    expect(fresh.slice(0, 5)).toEqual([
      "exec",
      "--json",
      "--image",
      "C:\ta.png",
      "--skip-git-repo-check",
    ]);
    expect(fresh.at(-1)).toBe("-");
    const resumed = codexArgs({
      server,
      thread: "t1",
      url: "u",
      workspace: "w",
      ephemeral: true,
      images: ["C:\ta.png", "C:\t\b.jpg"],
    });
    expect(resumed.slice(0, 7)).toEqual([
      "exec",
      "--json",
      "--image",
      "C:\ta.png",
      "--image",
      "C:\t\b.jpg",
      "--ephemeral",
    ]);
    expect(resumed.slice(-3)).toEqual(["resume", "t1", "-"]);
    expect(codexArgs({ server, url: "u", workspace: "w" })).not.toContain("--image");
    expect(imageExtension("image/jpeg")).toBe("jpg");
  });
});

import { describe, expect, it } from "vitest";
import { bytesDeDataUrl, tipoDaImagem, tipoDoAudio } from "./validacao";

const b = (...xs: number[]) => Uint8Array.from(xs);
const s = (t: string) => [...t].map((c) => c.charCodeAt(0));

describe("tipo pelo conteúdo", () => {
  it("reconhece os áudios gravados pelos navegadores", () => {
    expect(tipoDoAudio(b(0x1a, 0x45, 0xdf, 0xa3, 0))).toBe("audio/webm");
    expect(tipoDoAudio(b(...s("OggS"), 0))).toBe("audio/ogg");
    expect(tipoDoAudio(b(0, 0, 0, 0x20, ...s("ftypM4A ")))).toBe("audio/mp4");
    expect(tipoDoAudio(b(...s("<svg")))).toBeNull();
  });
  it("reconhece JPEG, PNG e WebP e recusa o resto", () => {
    expect(tipoDaImagem(b(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(tipoDaImagem(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(tipoDaImagem(b(...s("RIFF"), 0, 0, 0, 0, ...s("WEBP")))).toBe("image/webp");
    expect(tipoDaImagem(b(...s("GIF89a")))).toBeNull();
  });
});

describe("data URL com teto", () => {
  it("converte e respeita o limite", () => {
    const dados = Buffer.from("conteúdo").toString("base64");
    expect(bytesDeDataUrl(`data:audio/webm;codecs=opus;base64,${dados}`, 100)?.length).toBe(9);
    expect(bytesDeDataUrl(`data:audio/webm;base64,${dados}`, 4)).toBeNull();
    expect(bytesDeDataUrl("data:text/html,<b>oi</b>", 100)).toBeNull();
    expect(bytesDeDataUrl("data:image/png;base64,", 100)).toBeNull();
  });
});

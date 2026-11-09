import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEDIAPIPE_VERSION } from "./assets";

describe("versão do detector", () => {
  it("bate com o @mediapipe/tasks-vision instalado (senão o WASM em cache não casa com o JS)", () => {
    const pacote = JSON.parse(
      readFileSync(
        join(process.cwd(), "node_modules/@mediapipe/tasks-vision/package.json"),
        "utf8",
      ),
    ) as { version: string };
    expect(MEDIAPIPE_VERSION).toBe(pacote.version);
  });

  it("o package.json fixa a versão exata, sem faixa", () => {
    const app = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(app.dependencies["@mediapipe/tasks-vision"]).toBe(MEDIAPIPE_VERSION);
  });
});

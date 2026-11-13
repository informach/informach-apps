import { describe, expect, it } from "vitest";
import {
  conferirPin,
  DESBLOQUEIO_MS,
  emitirDesbloqueio,
  gerarHashDoPin,
  lerDesbloqueio,
} from "./pin";

const segredo = "segredo-de-teste-com-mais-de-32-caracteres";

describe("PIN dos pais", () => {
  it("guarda só o hash e confere o PIN certo", async () => {
    const hash = await gerarHashDoPin("2468");
    expect(hash).not.toContain("2468");
    expect(await conferirPin("2468", hash)).toBe(true);
    expect(await conferirPin("2469", hash)).toBe(false);
  });

  it("dois hashes do mesmo PIN são diferentes (sal próprio)", async () => {
    expect(await gerarHashDoPin("1234")).not.toBe(await gerarHashDoPin("1234"));
  });

  it("recusa PIN vazio, curto ou com letras, e PIN sem hash guardado", async () => {
    await expect(gerarHashDoPin("")).rejects.toThrow();
    await expect(gerarHashDoPin("123")).rejects.toThrow();
    await expect(gerarHashDoPin("12a4")).rejects.toThrow();
    const hash = await gerarHashDoPin("1234");
    expect(await conferirPin("", hash)).toBe(false);
    expect(await conferirPin("1234", null)).toBe(false);
    expect(await conferirPin("1234", "texto-qualquer")).toBe(false);
  });
});

describe("desbloqueio da área dos pais no aparelho", () => {
  it("vale só para o aparelho que digitou o PIN, e só por 10 minutos", () => {
    const agora = 1_000_000;
    const { valor } = emitirDesbloqueio(segredo, "aparelho-a", "generation-a", agora);
    expect(lerDesbloqueio(segredo, valor, "aparelho-a", "generation-a", agora + 1000)).toBe(
      agora + DESBLOQUEIO_MS,
    );
    expect(lerDesbloqueio(segredo, valor, "aparelho-b", "generation-a", agora + 1000)).toBeNull();
    expect(lerDesbloqueio(segredo, valor, "aparelho-a", "generation-b", agora + 1000)).toBeNull();
    expect(
      lerDesbloqueio(segredo, `${valor}.extra`, "aparelho-a", "generation-a", agora),
    ).toBeNull();
    expect(
      lerDesbloqueio(segredo, valor, "aparelho-a", "generation-a", agora + DESBLOQUEIO_MS),
    ).toBeNull();
    expect(
      lerDesbloqueio(
        "outro-segredo-com-mais-de-32-caracteres",
        valor,
        "aparelho-a",
        "generation-a",
        agora,
      ),
    ).toBeNull();
  });

  it("recusa ficha adulterada", () => {
    const { valor } = emitirDesbloqueio(segredo, "aparelho-a", "generation-a", 0);
    const [version, id, generation, , sig] = valor.split(".");
    expect(
      lerDesbloqueio(
        segredo,
        `${version}.${id}.${generation}.${Number.MAX_SAFE_INTEGER}.${sig}`,
        "aparelho-a",
        "generation-a",
        0,
      ),
    ).toBeNull();
    expect(lerDesbloqueio(segredo, undefined, "aparelho-a", "generation-a", 0)).toBeNull();
  });
});

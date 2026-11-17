import { describe, expect, it } from "vitest";
import {
  codigoDoSegredo,
  conferirPin,
  credencialDoSegredo,
  gerarHashDoPin,
  hashDoSegredo,
  novoSegredoDeAparelho,
  SegredoDeAparelhoSchema,
} from "./segredos";

describe("segredos de proteção", () => {
  it("PIN tem sal próprio, confere sem guardar texto e recusa formato corrompido", async () => {
    const a = await gerarHashDoPin("593871");
    const b = await gerarHashDoPin("593871");
    expect(a).not.toBe(b);
    expect(a).not.toContain("593871");
    expect(await conferirPin("593871", a)).toBe(true);
    expect(await conferirPin("593872", a)).toBe(false);
    for (const invalido of [null, "scrypt-v1$x$x", `${a}$extra`, "scrypt$AAAA$BBBB"])
      expect(await conferirPin("593871", invalido)).toBe(false);
    expect(await conferirPin(593871, a)).toBe(false);
    await expect(gerarHashDoPin("1234")).rejects.toThrow();
  });
  it("código não é o segredo de consulta e a credencial é vinculada ao aparelho", () => {
    const segredo = novoSegredoDeAparelho();
    expect(SegredoDeAparelhoSchema.parse(segredo)).toBe(segredo);
    const codigo = codigoDoSegredo(segredo);
    expect(codigo).toMatch(/^[A-F0-9]{10}$/);
    expect(SegredoDeAparelhoSchema.safeParse(codigo).success).toBe(false);
    expect(codigoDoSegredo(segredo)).toBe(codigo);
    expect(credencialDoSegredo(segredo, "A")).toBe(credencialDoSegredo(segredo, "A"));
    expect(credencialDoSegredo(segredo, "A")).not.toBe(credencialDoSegredo(segredo, "B"));
    expect(hashDoSegredo("consulta", segredo)).not.toBe(hashDoSegredo("credencial", segredo));
    expect(hashDoSegredo("consulta", segredo)).not.toContain(segredo);
  });
});

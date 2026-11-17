import { describe, expect, it } from "vitest";
import { listar, PERMISSOES_DE_QUEM_DIVIDE, restaurar } from "./index";
import { BRUNO, criarMundoDaProva } from "./testes";

describe("ids dos fatos depois de restaurar", () => {
  it("distingue alterações no mesmo tick, entre coletas e depois de fotografia ou diário", () => {
    const mundo = criarMundoDaProva();
    const familia = listar(mundo.estado.familias)[0];
    if (!familia) throw new Error("sem família");
    const foto = mundo.fotografar();
    const conceder = {
      t: "conceder_acesso" as const,
      perfilId: BRUNO,
      familiaId: familia.id,
      permissoes: [...PERMISSOES_DE_QUEM_DIVIDE],
    };
    const revogar = {
      t: "revogar_acesso" as const,
      perfilId: BRUNO,
      familiaId: familia.id,
    };
    mundo.aplicar(conceder);
    const primeiro = mundo.avancar(0).fatos;
    mundo.aplicar(revogar);
    mundo.aplicar(conceder);
    const seguintes = mundo.avancar(0).fatos;
    const diario = [...primeiro, ...seguintes];
    expect(diario).toHaveLength(3);
    expect(new Set(diario.map((fato) => fato.id)).size).toBe(3);
    for (const voltou of [restaurar(foto, diario), restaurar(mundo.fotografar())]) {
      expect(voltou.estado.relogio.tick).toBe(mundo.estado.relogio.tick);
      voltou.aplicar(revogar);
      voltou.aplicar(conceder);
      const novos = voltou.avancar(0).fatos;
      expect(novos).toHaveLength(2);
      expect(new Set([...diario, ...novos].map((fato) => fato.id)).size).toBe(5);
      expect(voltou.estado.acessos).toEqual(mundo.estado.acessos);
    }
  });
});

import { describe, expect, it } from "vitest";
import { listar, PERMISSOES_DE_QUEM_DIVIDE, restaurar } from "../index";
import { BRUNO, criarMundoDaProva } from "../testes";
import {
  FamiliaDuravelSchema,
  MoradorDuravelSchema,
  ObjetoDuravelSchema,
  RelacaoDuravelSchema,
} from "./entidades-duraveis";
import { FatoDuravelSchema, lerFatoDoDiario } from "./fatos";

function registros() {
  const mundo = criarMundoDaProva(),
    familia = listar(mundo.estado.familias)[0];
  if (!familia) throw new Error("Family absent");
  const foto = mundo.fotografar();
  mundo.aplicar({
    t: "conceder_acesso",
    perfilId: BRUNO,
    familiaId: familia.id,
    permissoes: [...PERMISSOES_DE_QUEM_DIVIDE],
  });
  const primeiro = mundo.avancar(0).fatos;
  mundo.aplicar({ t: "revogar_acesso", perfilId: BRUNO, familiaId: familia.id });
  const fatos = [...primeiro, ...mundo.avancar(0).fatos];
  return { mundo, foto, fatos };
}
describe("fatos duráveis lidos do diário", () => {
  it("reabre fatos produzidos pelo motor sem mudar permissões, IDs ou resultados", () => {
    const { mundo, foto, fatos } = registros();
    expect(fatos).toHaveLength(2);
    const lidos = fatos.map((f) => lerFatoDoDiario(JSON.stringify(f)));
    expect(lidos).toEqual(fatos);
    expect(restaurar(foto, lidos).hash("duravel")).toBe(mundo.hash("duravel"));
  });
  it("confere integralmente as entidades iniciais usadas pelos fatos", () => {
    const mundo = criarMundoDaProva();
    for (const f of listar(mundo.estado.familias)) expect(FamiliaDuravelSchema.parse(f)).toEqual(f);
    for (const m of listar(mundo.estado.moradores))
      expect(MoradorDuravelSchema.parse(m)).toEqual(m);
    for (const o of listar(mundo.estado.objetos)) expect(ObjetoDuravelSchema.parse(o)).toEqual(o);
    for (const r of listar(mundo.estado.relacoes)) expect(RelacaoDuravelSchema.parse(r)).toEqual(r);
  });
  it("recusa enum inválido, valor inseguro e campos desconhecidos sem normalização silenciosa", () => {
    const f = registros().fatos[0];
    if (!f) throw new Error("Fact absent");
    for (const invalido of [
      { ...f, tick: 1.5 },
      { ...f, tick: Number.MAX_SAFE_INTEGER + 1 },
      { ...f, segredo: "não aceitar" },
      { ...f, causa: { ...f.causa, autor: null } },
      { ...f, dados: { tipo: "desconhecido" } },
      { ...f, dados: { ...f.dados, permissoes: ["administrar_banco"] } },
      { ...f, dados: { ...f.dados, campoExtra: "não aceitar" } },
    ]) {
      expect(FatoDuravelSchema.safeParse(invalido).success).toBe(false);
      expect(() => lerFatoDoDiario(JSON.stringify(invalido))).toThrow(
        /^morada.journal.INTEGRIDADE$/,
      );
    }
  });
  it("recusa JSON duplicado ou alterado e não inclui conteúdo privado no erro", () => {
    const f = registros().fatos[0];
    if (!f) throw new Error("Fact absent");
    const json = JSON.stringify(f);
    for (const texto of [
      "{",
      JSON.stringify(f, null, 2),
      json.replace("{", '{"tick":999,'),
      '{"nome":"dado privado"}',
    ])
      expect(() => lerFatoDoDiario(texto)).toThrow(/^morada.journal.INTEGRIDADE$/);
  });
});

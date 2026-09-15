import { describe, expect, it } from "vitest";
import { resolveSeriesId } from "./recurrence";

const fixedId = () => "11111111-1111-4111-8111-111111111111";

describe("resolveSeriesId", () => {
  it("abre série ao ligar a repetição numa tarefa que não tinha", () => {
    expect(resolveSeriesId("weekly", null, fixedId)).toBe(fixedId());
  });

  it("mantém a série enquanto a repetição continua ligada", () => {
    expect(resolveSeriesId("weekly", "serie-antiga", fixedId)).toBe("serie-antiga");
  });

  it("limpa a série quando a repetição volta para nenhuma", () => {
    // O bug que isto fecha: a edição preservava `previous.seriesId`, e a tarefa
    // ficava dizendo que não repete enquanto ocupava um lugar no índice único
    // `(series_id, profile_id, due_at)`.
    expect(resolveSeriesId("none", "serie-antiga", fixedId)).toBeNull();
  });

  it("não abre série numa tarefa criada sem repetição", () => {
    expect(resolveSeriesId("none", null, fixedId)).toBeNull();
  });

  it("recomeça com série nova depois de ter parado", () => {
    const parou = resolveSeriesId("none", "serie-antiga", fixedId);
    expect(resolveSeriesId("weekly", parou, fixedId)).toBe(fixedId());
  });
});

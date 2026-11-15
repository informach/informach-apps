import { describe, expect, it } from "vitest";
import {
  type AlvoDaObra,
  adquirirTrava,
  conferirTrava,
  criarRegistroDeTravas,
  expirarTravas,
  liberarTrava,
  liberarTravasDaSessao,
  PRAZO_DA_TRAVA_DE_EDICAO_MS,
  renovarTrava,
  TRAVAS_DE_EDICAO_POR_MUNDO,
} from "./travas-de-edicao";

const GERACAO = "00000000-0000-4000-8000-000000000001";
const OUTRA_GERACAO = "00000000-0000-4000-8000-000000000002";
const lia = { perfilId: "lia", sessaoId: "sessao-lia" };
const bruno = { perfilId: "bruno", sessaoId: "sessao-bruno" };
function alvo(x = 0, andar = 0): AlvoDaObra {
  return {
    familiaId: "fam_1",
    loteId: "lote_1",
    peca: null,
    regioes: [{ andar, retangulo: [x, 0, x + 500, 500] }],
  };
}

describe("registro transitório das travas de obra", () => {
  it("exclui uma região e permite peças/regiões independentes, tangentes ou em outro andar", () => {
    const registro = criarRegistroDeTravas(GERACAO);
    expect(adquirirTrava(registro, 0, lia, alvo()).ok).toBe(true);
    expect(adquirirTrava(registro, 1, bruno, alvo(250))).toMatchObject({
      ok: false,
      motivo: "ocupado",
    });
    expect(adquirirTrava(registro, 2, bruno, alvo(500)).ok).toBe(true);
    expect(adquirirTrava(registro, 3, bruno, alvo(0, 1)).ok).toBe(true);
    expect(registro.travas).toHaveLength(2);
  });

  it("a peça é exclusiva mesmo quando as regiões propostas são diferentes", () => {
    const registro = criarRegistroDeTravas(GERACAO);
    const peca = { id: "obj_1", revisao: 2 } as const;
    expect(adquirirTrava(registro, 0, lia, { ...alvo(), peca }).ok).toBe(true);
    expect(adquirirTrava(registro, 1, bruno, { ...alvo(5000), peca })).toMatchObject({
      ok: false,
      motivo: "ocupado",
    });
  });

  it("aquisição repetida conserva o prazo; renovar exige a referência e o escopo vigentes", () => {
    const registro = criarRegistroDeTravas(GERACAO);
    const primeira = adquirirTrava(registro, 0, lia, alvo());
    if (!primeira.ok) throw new Error("Concessão ausente");
    expect(adquirirTrava(registro, 1000, lia, alvo())).toMatchObject({
      ok: true,
      mudou: false,
      concessao: { ateMs: 15_000 },
    });
    expect(renovarTrava(registro, 2000, bruno, primeira.concessao.referencia)).toMatchObject({
      ok: false,
      motivo: "trava_perdida",
    });
    expect(renovarTrava(registro, 3000, lia, primeira.concessao.referencia)).toMatchObject({
      ok: true,
      concessao: { ateMs: 18_000 },
    });
  });

  it("expira no prazo exato e uma aquisição nova não ressuscita a referência antiga", () => {
    const registro = criarRegistroDeTravas(GERACAO);
    const primeira = adquirirTrava(registro, 0, lia, alvo());
    if (!primeira.ok) throw new Error("Concessão ausente");
    expect(
      conferirTrava(
        registro,
        PRAZO_DA_TRAVA_DE_EDICAO_MS - 1,
        lia,
        primeira.concessao.referencia,
        alvo(),
      ).valida,
    ).toBe(true);
    expect(
      conferirTrava(
        registro,
        PRAZO_DA_TRAVA_DE_EDICAO_MS,
        lia,
        primeira.concessao.referencia,
        alvo(),
      ),
    ).toEqual({ valida: false, mudou: true });
    const segunda = adquirirTrava(registro, PRAZO_DA_TRAVA_DE_EDICAO_MS, lia, alvo());
    if (!segunda.ok) throw new Error("Segunda concessão ausente");
    expect(segunda.concessao.referencia.numero).toBeGreaterThan(
      primeira.concessao.referencia.numero,
    );
    expect(
      renovarTrava(registro, PRAZO_DA_TRAVA_DE_EDICAO_MS, lia, primeira.concessao.referencia).ok,
    ).toBe(false);
    expect(liberarTrava(registro, lia, primeira.concessao.referencia)).toBe(false);
    expect(registro.travas).toHaveLength(1);
  });

  it("troca de alvo/conexão invalida o handle anterior e mantém uma trava por perfil", () => {
    const registro = criarRegistroDeTravas(GERACAO);
    const primeira = adquirirTrava(registro, 0, lia, alvo());
    if (!primeira.ok) throw new Error("Concessão ausente");
    const novaSessao = { ...lia, sessaoId: "outra-sessao" };
    const segunda = adquirirTrava(registro, 1, novaSessao, alvo(1000));
    if (!segunda.ok) throw new Error("Segunda concessão ausente");
    expect(registro.travas).toHaveLength(1);
    expect(liberarTrava(registro, lia, primeira.concessao.referencia)).toBe(false);
    expect(liberarTravasDaSessao(registro, lia.sessaoId)).toBe(false);
    expect(liberarTravasDaSessao(registro, novaSessao.sessaoId)).toBe(true);
  });

  it("outra geração recusa o identificador numericamente igual", () => {
    const antigo = criarRegistroDeTravas(GERACAO);
    const novo = criarRegistroDeTravas(OUTRA_GERACAO);
    const a = adquirirTrava(antigo, 0, lia, alvo());
    const b = adquirirTrava(novo, 0, lia, alvo());
    if (!a.ok || !b.ok) throw new Error("Concessões ausentes");
    expect(a.concessao.referencia.numero).toBe(b.concessao.referencia.numero);
    expect(conferirTrava(novo, 0, lia, a.concessao.referencia, alvo()).valida).toBe(false);
  });

  it("uma tentativa conflitante preserva a seleção anterior do autor", () => {
    const registro = criarRegistroDeTravas(GERACAO);
    const a = adquirirTrava(registro, 0, lia, alvo());
    expect(adquirirTrava(registro, 0, bruno, alvo(1000)).ok).toBe(true);
    expect(adquirirTrava(registro, 1, lia, alvo(1000))).toMatchObject({
      ok: false,
      motivo: "ocupado",
    });
    if (!a.ok) throw new Error("Concessão ausente");
    expect(conferirTrava(registro, 1, lia, a.concessao.referencia, alvo()).valida).toBe(true);
  });

  it("cópias de entrada/saída não alteram o registro", () => {
    const registro = criarRegistroDeTravas(GERACAO);
    const entrada = alvo();
    const resultado = adquirirTrava(registro, 0, lia, entrada);
    if (!resultado.ok) throw new Error("Concessão ausente");
    entrada.loteId = "lote_alterado";
    resultado.concessao.alvo.familiaId = "fam_alterada";
    expect(conferirTrava(registro, 1, lia, resultado.concessao.referencia, alvo()).valida).toBe(
      true,
    );
  });

  it("memória e contador têm limites explícitos sem wrap ou efeitos parciais", () => {
    const registro = criarRegistroDeTravas(GERACAO);
    for (let i = 0; i < TRAVAS_DE_EDICAO_POR_MUNDO; i++)
      expect(
        adquirirTrava(
          registro,
          0,
          { perfilId: `autor${i}`, sessaoId: `sessao${i}` },
          alvo(i * 1000),
        ).ok,
      ).toBe(true);
    expect(adquirirTrava(registro, 0, bruno, alvo(50_000))).toMatchObject({
      ok: false,
      motivo: "limite",
    });
    registro.numero = Number.MAX_SAFE_INTEGER;
    expect(
      adquirirTrava(registro, 0, { perfilId: "autor0", sessaoId: "sessao0" }, alvo(60_000)),
    ).toMatchObject({ ok: false, motivo: "limite" });
    expect(registro.travas).toHaveLength(TRAVAS_DE_EDICAO_POR_MUNDO);
  });

  it("tempo regressivo, geração e geometria inválidos acusam contrato do host", () => {
    expect(() => criarRegistroDeTravas("geracao-do-cliente")).toThrow(/Geração/);
    const registro = criarRegistroDeTravas(GERACAO);
    expirarTravas(registro, 100);
    expect(() => expirarTravas(registro, 99)).toThrow(/monotônico/);
    expect(() => adquirirTrava(registro, 100, lia, { ...alvo(), regioes: [] })).toThrow(/Alvo/);
    expect(() => adquirirTrava(registro, 100, lia, alvo(-1))).toThrow(/Região/);
    expect(registro.travas).toEqual([]);
  });
});

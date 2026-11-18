import { describe, expect, it } from "vitest";
import type { EntradaDeVisitante, VisitaRenovada } from "../contrato/visitas";
import { criarPermissaoDeVisita } from "./permissao-de-visita";

const entrada: EntradaDeVisitante = {
  visitaId: "f9579968-a053-494b-b9db-908c407ba86e",
  sessaoDeVisitaId: "bff99a1f-9c9d-477c-aa83-a264caa7fab3",
  presencaDoAnfitriaoId: "c07fbe33-f2df-4148-95fb-f5f243244777",
  agora: "2026-11-18T06:00:00.000Z",
  permissaoAte: "2026-11-18T06:00:30.000Z",
  apelido: "Visitante",
  avatar: "sol",
  politica: { multiplayer: true, textoLivre: false, versao: 1 },
};
const renovada: VisitaRenovada = {
  estado: "ok",
  sessaoDeVisitaId: entrada.sessaoDeVisitaId,
  agora: "2026-11-18T06:00:10.000Z",
  permissaoAte: "2026-11-18T06:00:40.000Z",
};
function preparar() {
  let tempo = 1000,
    anfitriao = entrada.presencaDoAnfitriaoId;
  const permissao = criarPermissaoDeVisita(
    entrada,
    { enviadoEm: 0, recebidoEm: 1000 },
    {
      agora: () => tempo,
      anfitriaoConectado: (presenca) => presenca === anfitriao,
    },
  );
  return {
    permissao,
    tempo(valor: number) {
      tempo = valor;
    },
    anfitriao(valor: string) {
      anfitriao = valor;
    },
  };
}

describe("comandos sob concessão curta de visita", () => {
  it("negativa antiga após retomada nova suspende sem encerrar a concessão atual", () => {
    const c = preparar();
    c.tempo(2000);
    c.permissao.renovar(renovada, { enviadoEm: 2000, recebidoEm: 2000 });
    expect(() =>
      c.permissao.renovar(
        { estado: "perdida", sessaoDeVisitaId: entrada.sessaoDeVisitaId },
        { enviadoEm: 1000, recebidoEm: 1500 },
      ),
    ).toThrow("INDISPONIVEL");
    expect(c.permissao.estado).toBe("suspensa");
    c.tempo(3000);
    c.permissao.renovar(renovada, { enviadoEm: 3000, recebidoEm: 3000 });
    expect(c.permissao.estado).toBe("vigente");
  });
  it("uma resposta já usada não reabre a permissão suspensa depois de outra falha", () => {
    const c = preparar(),
      medicao = { enviadoEm: 1000, recebidoEm: 1000 };
    c.permissao.renovar(renovada, medicao);
    c.permissao.suspender();
    expect(() => c.permissao.renovar(renovada, medicao)).toThrow("INDISPONIVEL");
    expect(c.permissao.podeJogar()).toBe(false);
  });
  it("comando recebido válido não atravessa a fila depois de vencer o prazo", async () => {
    const c = preparar();
    expect(c.permissao.podeJogar()).toBe(true);
    const executar = () => (c.permissao.podeJogar() ? "aplicado" : "recusado");
    c.tempo(30000);
    expect(await Promise.resolve().then(executar)).toBe("recusado");
    expect(c.permissao.estado).toBe("suspensa");
  });
  it("cache vencido só volta depois de confirmação integral nova", () => {
    const c = preparar();
    c.tempo(31000);
    expect(c.permissao.podeJogar()).toBe(false);
    c.permissao.renovar(renovada, { enviadoEm: 31000, recebidoEm: 31000 });
    expect(c.permissao.podeJogar()).toBe(true);
  });
  it("resposta incerta suspende imediatamente, conservando a necessidade de revalidação", () => {
    const c = preparar();
    c.permissao.suspender();
    expect(c.permissao.podeJogar()).toBe(false);
    c.permissao.renovar(renovada, { enviadoEm: 1000, recebidoEm: 1000 });
    expect(c.permissao.podeJogar()).toBe(true);
  });
  it.each(["saiu", "outra_presenca"] as const)(
    "anfitrião %s corta imediatamente e não reabre",
    (tipo) => {
      const c = preparar();
      c.anfitriao(tipo === "saiu" ? "" : crypto.randomUUID());
      expect(c.permissao.estado).toBe("encerrada");
      c.anfitriao(entrada.presencaDoAnfitriaoId);
      c.permissao.renovar(renovada, { enviadoEm: 1000, recebidoEm: 1000 });
      expect(c.permissao.podeJogar()).toBe(false);
    },
  );
  it("recusa explícita e encerramento manual são terminais", () => {
    for (const manual of [true, false]) {
      const c = preparar();
      if (manual) c.permissao.encerrar();
      else
        c.permissao.renovar(
          { sessaoDeVisitaId: entrada.sessaoDeVisitaId, estado: "perdida" },
          { enviadoEm: 1000, recebidoEm: 1000 },
        );
      c.permissao.renovar(renovada, { enviadoEm: 1000, recebidoEm: 1000 });
      expect(c.permissao.estado).toBe("encerrada");
    }
  });
  it.each(["outro_vinculo", "antiga", "prazo_longo"] as const)(
    "recusa resposta %s sem conservar o cache anterior",
    (tipo) => {
      const c = preparar();
      expect(() =>
        c.permissao.renovar(
          {
            ...renovada,
            ...(tipo === "outro_vinculo" ? { sessaoDeVisitaId: crypto.randomUUID() } : {}),
            ...(tipo === "prazo_longo" ? { permissaoAte: "2026-11-18T06:01:40.000Z" } : {}),
          },
          tipo === "antiga"
            ? { enviadoEm: 0, recebidoEm: 500 }
            : { enviadoEm: 1000, recebidoEm: 1000 },
        ),
      ).toThrow("INDISPONIVEL");
      expect(c.permissao.podeJogar()).toBe(false);
    },
  );
  it("relógio inválido suspende e resposta atrasada não ganha trinta segundos novos", () => {
    const c = preparar();
    c.tempo(NaN);
    expect(c.permissao.podeJogar()).toBe(false);
    c.tempo(40000);
    c.permissao.renovar(renovada, { enviadoEm: 1000, recebidoEm: 40000 });
    expect(c.permissao.podeJogar()).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { ClienteDoHostComPresencas } from "../contrato/host";
import type { ReciboDePresenca } from "../contrato/presencas";
import { ErroDoRecreio } from "../dominio/erros";
import { MundoIdSchema, PerfilIdSchema, SessaoDeJogoIdSchema } from "../dominio/ids";
import { criarPresencaDaConexao } from "./presenca-da-conexao";

const entrada = {
  mundoId: MundoIdSchema.parse("7b402452-a838-4227-8016-8f162ea135f7"),
  cerca: 3,
  sid: SessaoDeJogoIdSchema.parse("511a8951-26be-47bf-b24f-95ab9e52b6cf"),
  perfilId: PerfilIdSchema.parse("20cd5f99-3345-42ce-b1db-6cbdb48415c3"),
  chaveDeEntrada: "a01e9d8e-84ea-420e-b22d-4c372317b8b8",
};
const ativa: ReciboDePresenca = {
  presencaId: "c07fbe33-f2df-4148-95fb-f5f243244777",
  estado: "active",
  expiraEm: "2026-11-18T06:00:30.000Z",
  janelaAte: "2026-11-19T06:00:00.000Z",
};
const fechada: ReciboDePresenca = { ...ativa, estado: "closed" };

function preparar() {
  let conectado = true;
  const host = {
    atestarPresenca: vi.fn<ClienteDoHostComPresencas["atestarPresenca"]>(async (pedido) =>
      pedido.operacao === "sair" ? fechada : ativa,
    ),
    consultarPresenca: vi.fn<ClienteDoHostComPresencas["consultarPresenca"]>(async () => ({
      presenca: ativa,
    })),
  };
  const presenca = criarPresencaDaConexao({ host, entrada, estaConectado: () => conectado });
  return {
    host,
    presenca,
    desconectar() {
      conectado = false;
    },
    reconectar() {
      conectado = true;
    },
  };
}

function pendente<T>() {
  let resolver: (valor: T) => void = () => {
    throw new Error("Promise não preparada");
  };
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

describe("atestado da conexão real do anfitrião", () => {
  it("não publica nem renova uma conexão que já caiu antes do primeiro pedido", async () => {
    const c = preparar();
    c.desconectar();
    await c.presenca.atualizar();
    expect(c.presenca.concluida).toBe(true);
    expect(c.presenca.recibo).toBeNull();
    expect(c.presenca.renovacao()).toBeNull();
    expect(c.host.atestarPresenca).not.toHaveBeenCalled();
  });

  it("coalesce a entrada e expõe somente o pedido de renovação da conexão atual", async () => {
    const c = preparar();
    await Promise.all([c.presenca.atualizar(), c.presenca.atualizar()]);
    expect(c.presenca.recibo).toEqual(ativa);
    expect(c.host.atestarPresenca).toHaveBeenCalledTimes(1);
    const { chaveDeEntrada: _chave, ...base } = entrada;
    expect(c.presenca.renovacao()).toEqual({ ...base, presencaId: ativa.presencaId });
    c.desconectar();
    expect(c.presenca.renovacao()).toBeNull();
    await c.presenca.atualizar();
    expect(c.presenca.recibo).toEqual(fechada);
    c.reconectar();
    await c.presenca.atualizar();
    expect(c.presenca.concluida).toBe(true);
    expect(c.presenca.renovacao()).toBeNull();
  });

  it("encerra a entrada que respondeu depois da desconexão", async () => {
    const c = preparar(),
      resposta = pendente<ReciboDePresenca>(),
      chegou = pendente<void>();
    c.host.atestarPresenca.mockImplementationOnce(async () => {
      chegou.resolver();
      return resposta.promessa;
    });
    const abrindo = c.presenca.atualizar();
    await chegou.promessa;
    c.desconectar();
    resposta.resolver(ativa);
    await abrindo;
    expect(c.presenca.recibo).toEqual(fechada);
    expect(c.presenca.concluida).toBe(true);
  });

  it("a intenção de sair vale durante o pedido, sem depender de um socket fechar", async () => {
    const c = preparar(),
      resposta = pendente<ReciboDePresenca>(),
      chegou = pendente<void>();
    c.host.atestarPresenca.mockImplementationOnce(async () => {
      chegou.resolver();
      return resposta.promessa;
    });
    const abrindo = c.presenca.atualizar();
    await chegou.promessa;
    const saindo = c.presenca.encerrar();
    expect(c.presenca.renovacao()).toBeNull();
    resposta.resolver(ativa);
    await Promise.all([abrindo, saindo]);
    expect(c.presenca.recibo).toEqual(fechada);
    expect(c.host.atestarPresenca).toHaveBeenCalledTimes(2);
  });

  it("resposta perdida e socket fechado recuperam apenas por consulta e saída", async () => {
    const c = preparar();
    c.host.atestarPresenca.mockRejectedValueOnce(new ErroDoRecreio("INDISPONIVEL"));
    await expect(c.presenca.atualizar()).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    c.desconectar();
    await c.presenca.encerrar();
    expect(c.presenca.recibo).toEqual(fechada);
    expect(c.host.consultarPresenca).toHaveBeenCalledWith(entrada);
    expect(c.host.atestarPresenca.mock.calls.map(([p]) => p.operacao)).toEqual(["entrar", "sair"]);
  });

  it("consulta ausente não descarta uma entrada incerta que ainda pode gravar", async () => {
    const c = preparar();
    c.host.atestarPresenca.mockRejectedValueOnce(new ErroDoRecreio("INDISPONIVEL"));
    c.host.consultarPresenca.mockResolvedValueOnce({ presenca: null });
    await expect(c.presenca.atualizar()).rejects.toThrow();
    c.desconectar();
    await c.presenca.encerrar();
    expect(c.presenca.concluida).toBe(false);
    expect(c.presenca.recibo).toBeNull();
    expect(c.presenca.renovacao()).toBeNull();
    await c.presenca.atualizar();
    expect(c.presenca.recibo).toEqual(fechada);
    expect(c.host.atestarPresenca.mock.calls.map(([p]) => p.operacao)).toEqual(["entrar", "sair"]);
  });

  it("só repete entrada incerta enquanto conectado e conserva a mesma chave", async () => {
    const c = preparar();
    c.host.atestarPresenca.mockRejectedValueOnce(new ErroDoRecreio("INDISPONIVEL"));
    c.host.consultarPresenca.mockResolvedValueOnce({ presenca: null });
    await expect(c.presenca.atualizar()).rejects.toThrow();
    await c.presenca.atualizar();
    expect(c.presenca.recibo).toEqual(ativa);
    expect(c.host.atestarPresenca.mock.calls.map(([p]) => p)).toEqual([
      { ...entrada, operacao: "entrar" },
      { ...entrada, operacao: "entrar" },
    ]);
  });

  it("relê a conexão depois da consulta, antes de tentar entrada novamente", async () => {
    const c = preparar();
    c.host.atestarPresenca.mockRejectedValueOnce(new ErroDoRecreio("INDISPONIVEL"));
    c.host.consultarPresenca.mockImplementationOnce(async () => {
      c.desconectar();
      return { presenca: null };
    });
    await expect(c.presenca.atualizar()).rejects.toThrow();
    await c.presenca.atualizar();
    expect(c.presenca.recibo).toEqual(fechada);
    expect(c.host.atestarPresenca.mock.calls.map(([p]) => p.operacao)).toEqual(["entrar", "sair"]);
  });

  it("consulta já fechada nunca reabre nem envia outra saída", async () => {
    const c = preparar();
    c.host.atestarPresenca.mockRejectedValueOnce(new ErroDoRecreio("INDISPONIVEL"));
    c.host.consultarPresenca.mockResolvedValueOnce({ presenca: fechada });
    await expect(c.presenca.atualizar()).rejects.toThrow();
    await c.presenca.atualizar();
    expect(c.presenca.concluida).toBe(true);
    expect(c.presenca.renovacao()).toBeNull();
    expect(c.host.atestarPresenca).toHaveBeenCalledTimes(1);
  });

  it.each(["rede", "estado", "outro_id"] as const)(
    "saída sem prova (%s) permanece pendente",
    async (tipo) => {
      const c = preparar();
      await c.presenca.atualizar();
      if (tipo === "rede")
        c.host.atestarPresenca.mockRejectedValueOnce(new ErroDoRecreio("INDISPONIVEL"));
      else
        c.host.atestarPresenca.mockResolvedValueOnce(
          tipo === "estado" ? ativa : { ...fechada, presencaId: crypto.randomUUID() },
        );
      await expect(c.presenca.encerrar()).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
      expect(c.presenca.concluida).toBe(false);
      expect(c.presenca.renovacao()).toBeNull();
      await c.presenca.atualizar();
      expect(c.presenca.recibo).toEqual(fechada);
      expect(c.presenca.concluida).toBe(true);
    },
  );

  it("o recibo lido não permite mutar o estado interno do produtor", async () => {
    const c = preparar();
    await c.presenca.atualizar();
    const copiado = c.presenca.recibo;
    if (!copiado) throw new Error("Recibo ausente");
    copiado.estado = "closed";
    expect(c.presenca.recibo).toEqual(ativa);
    expect(c.presenca.concluida).toBe(false);
  });
});

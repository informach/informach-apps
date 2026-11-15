import { gzipSync } from "node:zlib";
import { abrirFotografia } from "@informach/morada-sim";
import { FECHAMENTO } from "@informach/morada-sim/protocolo";
import { POSSE_TTL_MS } from "@informach/recreio";
import { expect, it, vi } from "vitest";
import { decodificarFotografia } from "../src/fotografia";
import { criarBancada } from "./apoio";

it.each(["diario_cortado", "fotografia_ausente", "tick_divergente", "outro_mundo"] as const)(
  "recuperação %s recusa abrir e não grava uma fotografia substituta",
  async (falha) => {
    const bancada = await criarBancada({ checkpointMs: 1_000_000 });
    const a = await bancada.novaInstancia("wss://a.test");
    const lia = bancada.jogador("Lia");
    const mundoId = bancada.criarMundo(lia);
    await bancada.entrar(lia, mundoId);
    const moradora = lia.moradorDeNome("Lia").id;
    await lia.comando(moradora, { t: "reservar" });
    await lia.comando(moradora, { t: "definir_preferido", valor: true });
    await bancada.andar(2);
    const antes = bancada.plataforma.mundo(mundoId);
    expect(antes.diarioSeq).toBeGreaterThan(antes.fotografias.at(-1)?.diarioSeq ?? 0);
    a.host.foraDoAr = true;
    lia.cair();
    bancada.esperar(POSSE_TTL_MS + 1);
    const b = await bancada.novaInstancia("wss://b.test");
    const lerFoto = b.host.lerFotografia;
    const lerDiario = b.host.lerDiario;
    const fotografia = vi.spyOn(b.host, "lerFotografia").mockImplementation(async (pedido) => {
      const foto = await lerFoto(pedido);
      if (!foto) throw new Error("A prova precisa de uma fotografia anterior");
      if (falha === "fotografia_ausente") return null;
      if (falha === "tick_divergente")
        return { ...foto, meta: { ...foto.meta, tick: foto.meta.tick + 1 } };
      if (falha === "outro_mundo") {
        const documento = abrirFotografia(decodificarFotografia(foto.bytes));
        documento.mundoId = "outro-mundo";
        documento.estado.id = "outro-mundo";
        return { ...foto, bytes: gzipSync(JSON.stringify(documento)) };
      }
      return foto;
    });
    const diario = vi.spyOn(b.host, "lerDiario").mockImplementation(async (pedido) => {
      const entradas = await lerDiario(pedido);
      return falha === "diario_cortado" ? entradas.slice(0, -1) : entradas;
    });
    try {
      await bancada.entrar(lia, mundoId);
      expect(lia.fechamento).toBe(FECHAMENTO.reiniciando);
      expect(b.instancia.ator(mundoId)?.simulacao).toBeNull();
      expect(b.host.chamadas).not.toContain("gravarFotografia");
      const depois = bancada.plataforma.mundo(mundoId);
      expect(depois.revisao).toBe(antes.revisao);
      expect(depois.diario).toEqual(antes.diario);
    } finally {
      fotografia.mockRestore();
      diario.mockRestore();
    }
  },
);

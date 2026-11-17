import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import type { PacoteLido } from "./arte";
import { CacheDePersonagens } from "./cache-de-personagens";

function recurso() {
  const geometria = new BufferGeometry();
  geometria.setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
  const material = new MeshBasicMaterial();
  const scene = new Group();
  scene.add(new Mesh(geometria, material));
  return { pacote: { scene, animations: [] } satisfies PacoteLido, geometria, material };
}

function soltar(pacote: PacoteLido) {
  pacote.scene.traverse((objeto) => {
    if (!(objeto instanceof Mesh)) return;
    objeto.geometry.dispose();
    for (const material of Array.isArray(objeto.material) ? objeto.material : [objeto.material])
      material.dispose();
  });
}

describe("cache de personagens sem instâncias vivas", () => {
  it("deduplica empréstimos concorrentes e remove só os ociosos mais antigos", async () => {
    const descartados: string[] = [];
    const pedidos: string[] = [];
    const cache = new CacheDePersonagens(
      async (arquivo) => {
        pedidos.push(arquivo);
        const r = recurso();
        r.geometria.addEventListener("dispose", () => descartados.push(arquivo));
        return r.pacote;
      },
      () => 12,
      soltar,
      12,
      1,
    );
    const [a, b] = await Promise.all([cache.adquirir("a"), cache.adquirir("a")]);
    if (!a || !b) throw new Error("Pacote ausente");
    expect(a.pacote).toBe(b.pacote);
    expect(pedidos).toEqual(["a"]);
    a.liberar();
    a.liberar();
    const c = await cache.adquirir("c");
    c?.liberar();
    const d = await cache.adquirir("d");
    d?.liberar();
    expect(descartados).toEqual(["c"]);
    b.liberar();
    expect(descartados).toEqual(["c", "d"]);
    const outra = await cache.adquirir("a");
    expect(outra?.pacote).toBe(a.pacote);
    cache.dispose();
    cache.dispose();
    outra?.liberar();
    expect(descartados).toEqual(["c", "d", "a"]);
  });

  it("encerra um download em andamento e solta seu resultado tardio uma única vez", async () => {
    const r = recurso();
    let descartes = 0;
    r.geometria.addEventListener("dispose", () => descartes++);
    let liberar: (pacote: PacoteLido) => void = () => {
      throw new Error("Download não iniciado");
    };
    const download = new Promise<PacoteLido>((resolve) => {
      liberar = resolve;
    });
    const cache = new CacheDePersonagens(
      () => download,
      () => 12,
      soltar,
    );
    const pedido = cache.adquirir("a");
    await Promise.resolve();
    cache.dispose();
    liberar(r.pacote);
    expect(await pedido).toBeNull();
    expect(descartes).toBe(1);
    expect(await cache.adquirir("a")).toBeNull();
  });

  it("não conserva rejeição no cache e refaz o pedido depois da falha", async () => {
    let chamadas = 0;
    const cache = new CacheDePersonagens(
      async () => {
        chamadas++;
        if (chamadas === 1) throw new Error("Rede indisponível");
        return recurso().pacote;
      },
      () => 12,
      soltar,
    );
    await expect(cache.adquirir("a")).rejects.toThrow("Rede indisponível");
    const uso = await cache.adquirir("a");
    expect(uso).not.toBeNull();
    expect(chamadas).toBe(2);
    uso?.liberar();
    cache.dispose();
  });
});

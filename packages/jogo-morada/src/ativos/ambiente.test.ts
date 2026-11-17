import type { ObjetoDoManifesto } from "@informach/morada-arte/manifesto";
import type { Objeto, ObjetoId } from "@informach/morada-sim";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Texture,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { manifesto } from "../testes/manifesto-de-arte";
import { AtivosDeArte } from "./arte";
import type { ObjetoDaCena } from "./ativos";

const entrada: ObjetoDoManifesto = {
  id: "sofa_teste",
  versao: 1,
  arquivo: "sofa_teste.0123456789.glb",
  bytes: 10,
  limites: [
    [-1, 0, -0.5],
    [1, 0.8, 0.5],
  ],
  apoios: { sentar_1: 0.47 },
  desenho: { chamadas: 1, triangulos: 12, vertices: 24, texturas: 0 },
};
function objeto(id: string, x = 0): ObjetoDaCena {
  return {
    objeto: { id, catalogo: entrada.id, versao: 1, giro: 90 } as Objeto,
    entrada: undefined,
    posicao: [x, 0, 0],
  };
}
const esperar = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

function preparar(extra: { jsonInvalido?: boolean; falharObjeto?: boolean } = {}) {
  const geometria = new BoxGeometry(2, 0.8, 1).translate(0, 0.4, 0);
  const material = new MeshBasicMaterial();
  const cena = new Group().add(new Mesh(geometria, material));
  const textura = new Texture();
  const m = manifesto({
    personagens: [],
    bibliotecas: [],
    objetos: [entrada],
    acabamentos: [{ id: "piso_teste", arquivo: "piso_teste.0123456789.png", bytes: 4, escala: 2 }],
  });
  const pedidos: { url: string; token: string | null }[] = [];
  const erros: string[] = [];
  const ativos = new AtivosDeArte({
    origem: "http://jogo.local",
    token: () => "sessao-atual",
    fetch: async (input, init) => {
      const url = String(input);
      pedidos.push({ url, token: new Headers(init?.headers).get("authorization") });
      if (url.endsWith("manifest.json"))
        return extra.jsonInvalido ? new Response("{") : Response.json(m);
      if (extra.falharObjeto && url.endsWith(".glb")) return new Response("", { status: 503 });
      return new Response(new Uint8Array([1, 2, 3]));
    },
    lerPacote: async () => ({ scene: cena, animations: [] }),
    lerTextura: async () => textura,
    aoFalhar: (arquivo) => erros.push(arquivo),
  });
  return { ativos, pedidos, erros, geometria, material, textura };
}

describe("ambiente com arte", () => {
  it("carrega uma vez, agrupa repetições e mantém seleção ao filtrar", async () => {
    const { ativos, pedidos, geometria, material } = preparar();
    const avisar = vi.fn();
    ativos.aoMudar(avisar);
    const primeiro = objeto("obj_um", 2);
    const itens = [primeiro, objeto("obj_dois", 5)];
    const inicial = ativos.criarObjetos(itens);
    expect(ativos.apoio(primeiro.objeto, "sentar_1", "sentado")).not.toBe(470);
    await esperar();
    inicial.dispose();
    const visual = ativos.criarObjetos(itens);
    const malha = visual.raiz.children.find(
      (x) => x instanceof InstancedMesh && x.material === material,
    ) as InstancedMesh;
    expect(malha.count).toBe(2);
    expect(malha.geometry).toBe(geometria);
    expect(malha.material).toBe(material);
    expect(ativos.apoio(primeiro.objeto, "sentar_1", "sentado")).toBe(470);
    expect(pedidos.filter((x) => x.url.endsWith(".glb"))).toHaveLength(1);
    expect(
      pedidos.every((x) => x.token === "Bearer sessao-atual" && !x.url.includes("sessao-atual")),
    ).toBe(true);
    expect(avisar).toHaveBeenCalled();
    visual.definirVisiveis((x) => x.objeto.id === "obj_dois");
    expect(malha.count).toBe(1);
    expect(
      visual.objetoDe({ object: malha, instanceId: 0, distance: 0, point: new Vector3() }),
    ).toBe("obj_dois");
    expect(visual.topoDe("obj_dois" as ObjetoId)).toEqual([5, 0.8, 0]);
    const soltar = vi.spyOn(geometria, "dispose");
    visual.dispose();
    expect(soltar).not.toHaveBeenCalled();
    ativos.dispose();
    expect(soltar).toHaveBeenCalledTimes(1);
  });

  it("carrega acabamento autenticado, com escala, e solta material e textura", async () => {
    const { ativos, textura, pedidos } = preparar();
    expect(ativos.acabamento("piso_teste")).toBeNull();
    ativos.acabamento("piso_teste");
    await esperar();
    const mat = ativos.acabamento("piso_teste");
    expect(mat?.map).toBe(textura);
    expect(textura.repeat.toArray()).toEqual([0.5, 0.5]);
    expect(pedidos.filter((x) => x.url.endsWith(".png"))).toHaveLength(1);
    const soltar = vi.spyOn(textura, "dispose");
    ativos.dispose();
    expect(soltar).toHaveBeenCalledTimes(1);
  });

  it("JSON inválido e download recusado deixam a cena procedural, sem rejeição solta", async () => {
    for (const opcoes of [{ jsonInvalido: true }, { falharObjeto: true }]) {
      const { ativos, erros } = preparar(opcoes);
      const visual = ativos.criarObjetos([objeto("um")]);
      await esperar();
      expect(erros.length).toBeGreaterThan(0);
      expect(visual.raiz.children).toHaveLength(1);
      visual.dispose();
      ativos.dispose();
    }
  });

  it("não baixa modelo que não está na cena e não notifica depois do descarte", async () => {
    const { ativos, pedidos } = preparar();
    const avisar = vi.fn();
    ativos.aoMudar(avisar);
    const visual = ativos.criarObjetos([]);
    await esperar();
    expect(pedidos.filter((x) => x.url.endsWith(".glb"))).toHaveLength(0);
    ativos.criarObjetos([objeto("um")]).dispose();
    ativos.dispose();
    await esperar();
    expect(avisar).not.toHaveBeenCalled();
    visual.dispose();
  });
});

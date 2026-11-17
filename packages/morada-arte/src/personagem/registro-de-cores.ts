import type { Rgb } from "../cor/cores";
import { type ParametrosDosVertices, parametrosDosVertices } from "../cor/parametros";
import type { FonteDeCor } from "../cor/pintura";
import { CanalDeCorSchema, type CoresDoPersonagem, CoresDoPersonagemSchema } from "../manifesto";
import type { Parte } from "./partes";

/** Identidade de cada canal vem da peça e de seu papel na montagem. */
export class RegistroDeCores {
  private readonly canais: CoresDoPersonagem["canais"] = [];

  constructor(private readonly referenciaDePele: string) {}

  registrar(parte: Parte): number {
    const destino = parte.canalDeCor;
    if (!destino) throw new Error(`Parte ${parte.nome} não declara canal`);
    const inicial = corInicial(parte.fonte);
    const canal = CanalDeCorSchema.parse({ ...destino, inicial });
    const indice = this.canais.findIndex((c) => c.id === canal.id);
    if (indice >= 0) {
      const existente = this.canais[indice];
      if (!existente || JSON.stringify(existente) !== JSON.stringify(canal))
        throw new Error(`Canal ${canal.id} com definição divergente`);
      return indice;
    }
    CoresDoPersonagemSchema.parse({
      referenciaDePele: this.referenciaDePele,
      canais: [...this.canais, canal],
    });
    this.canais.push(canal);
    return this.canais.length - 1;
  }

  vertices(partes: readonly Parte[]): Map<Parte, ParametrosDosVertices & { canal: number }> {
    const saida = new Map<Parte, ParametrosDosVertices & { canal: number }>();
    for (const parte of partes) {
      if (!parte.canalDeCor) continue;
      saida.set(parte, {
        ...parametrosDosVertices(
          parte.fonte,
          parte.uv,
          parte.posicoes.length / 3,
          parte.coresDoArquivo,
        ),
        canal: this.registrar(parte),
      });
    }
    return saida;
  }

  manifesto(): CoresDoPersonagem {
    return CoresDoPersonagemSchema.parse({
      referenciaDePele: this.referenciaDePele,
      canais: this.canais,
    });
  }
}

function corInicial(fonte: FonteDeCor): Rgb {
  if (fonte.tipo === "lisa") return fonte.cor;
  if (fonte.tipo === "paleta") return fonte.fator;
  if (!fonte.livre || !fonte.mascara) throw new Error("Canal de roupa sem cor livre e máscara");
  return fonte.livre.cor;
}

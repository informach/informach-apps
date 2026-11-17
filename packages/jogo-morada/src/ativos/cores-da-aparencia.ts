import {
  hexParaLinear,
  inteiroParaHex,
  type Rgb,
  tomDePeleLivre,
} from "@informach/morada-arte/cores";
import type { PersonagemDoManifesto } from "@informach/morada-arte/manifesto";
import { type Aparencia, EdicaoDaAparenciaSchema } from "@informach/morada-sim";

/** A receita RGB vira somente dados de uniformes; nenhuma parte gera GLSL. */
export function coresDaAparencia(
  personagem: PersonagemDoManifesto,
  aparencia: Aparencia,
): ReadonlyMap<string, Rgb> {
  if (!aparencia.edicao) return new Map();
  if (!personagem.cores || !personagem.criacao)
    throw new Error("Receita nova exige um personagem do catálogo de criação");
  const edicao = EdicaoDaAparenciaSchema.parse(aparencia.edicao);
  const tom = tomDePeleLivre(personagem.cores.referenciaDePele, inteiroParaHex(aparencia.pele));
  const saida = new Map<string, Rgb>();
  for (const canal of personagem.cores.canais) {
    if (canal.origem === "pele") saida.set(canal.id, tom.pele);
    else if (canal.origem === "rosto") saida.set(canal.id, [tom.rosto, tom.rosto, tom.rosto]);
    else if (canal.origem === "cabelo")
      saida.set(canal.id, hexParaLinear(inteiroParaHex(edicao.corDoCabelo)));
    else {
      const cor = canal.parte === null ? undefined : edicao.coresDaRoupa[canal.parte];
      if (cor === undefined) throw new Error("Receita sem a cor de uma parte da roupa");
      saida.set(canal.id, hexParaLinear(inteiroParaHex(cor)));
    }
  }
  return saida;
}

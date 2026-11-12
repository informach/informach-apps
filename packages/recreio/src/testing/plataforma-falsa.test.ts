import { descreverConformidadeDoHost } from "./conformidade";
import { criarPlataformaFalsa } from "./plataforma-falsa";

descreverConformidadeDoHost("plataforma em memória", (opcoes) => criarPlataformaFalsa(opcoes));

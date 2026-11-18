import type { CategoriaDeDenuncia } from "@informach/recreio/contrato";

/** Rótulos portáteis da interface; apenas o servidor admite a categoria do contrato. */
export const CATEGORIAS_DE_DENUNCIA: { valor: CategoriaDeDenuncia; rotulo: string }[] = [
  { valor: "contato_indesejado", rotulo: "Contato que eu não quero" },
  { valor: "assedio", rotulo: "Insistência, ofensa ou perseguição" },
  { valor: "conteudo_inadequado", rotulo: "Algo que não deveria aparecer aqui" },
  { valor: "dados_pessoais", rotulo: "Pedido ou exposição de dados pessoais" },
  { valor: "ameaca", rotulo: "Ameaça ou risco à segurança" },
  { valor: "outro", rotulo: "Outro cuidado com este contato" },
];

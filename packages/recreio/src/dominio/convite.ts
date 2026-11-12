/**
 * Código de convite: dez caracteres de um alfabeto sem letras e números que se
 * confundem, mostrado como `XXXXX-XXXXX`. Vale 24 h e uma vez. O banco guarda
 * só um resumo com chave; o código em si existe na tela de quem convidou.
 */

export const ALFABETO_DO_CONVITE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TAMANHO_DO_CONVITE = 10;
export const VALIDADE_DO_CONVITE_MS = 24 * 60 * 60 * 1000;

/**
 * Sorteia o código sem viés: bytes acima do maior múltiplo do alfabeto são
 * descartados. `sortear` existe para os testes; em uso real é o gerador do
 * sistema.
 */
export function gerarCodigoDeConvite(
  sortear: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const limite = 256 - (256 % ALFABETO_DO_CONVITE.length);
  let codigo = "";
  while (codigo.length < TAMANHO_DO_CONVITE) {
    const bytes = sortear(new Uint8Array(TAMANHO_DO_CONVITE * 2));
    for (const byte of bytes) {
      if (byte >= limite) continue;
      codigo += ALFABETO_DO_CONVITE[byte % ALFABETO_DO_CONVITE.length];
      if (codigo.length === TAMANHO_DO_CONVITE) break;
    }
  }
  return codigo;
}

export function formatarCodigoDeConvite(codigo: string): string {
  return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
}

/**
 * Aceita o que a pessoa digitou (minúsculas, espaços, hífen) e devolve o
 * código canônico, ou `null` se não tiver a forma de um convite.
 */
export function normalizarCodigoDeConvite(entrada: string): string | null {
  const limpo = entrada.toUpperCase().replace(/[\s-]/g, "");
  if (limpo.length !== TAMANHO_DO_CONVITE) return null;
  for (const caractere of limpo) {
    if (!ALFABETO_DO_CONVITE.includes(caractere)) return null;
  }
  return limpo;
}

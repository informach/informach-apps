/**
 * A foto tirada na folha "O que chegou?", a caminho da tela do recado.
 *
 * No canvas, tocar em "Foto" abre a câmera e a tela seguinte já mostra a foto.
 * A folha mora no rodapé e a tela do recado é outra rota; a navegação é do
 * cliente, então o arquivo atravessa num módulo, sem servidor nenhum no meio e
 * sem guardar nada no aparelho. Se a página recarregar no caminho, a foto se
 * perde e a tela mostra o "Tirar foto" de sempre.
 */
let pending: File | null = null;

export function handOffPhoto(file: File) {
  pending = file;
}

/** Devolve a foto deixada pela folha e a esquece: ela vale para uma tela só. */
export function takeHandedPhoto(): File | null {
  const file = pending;
  pending = null;
  return file;
}

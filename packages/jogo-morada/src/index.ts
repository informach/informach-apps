/**
 * Cliente do Morada. Carregado sob demanda pela rota `/jogar/morada` do
 * Recreio; nunca entra no bundle do portal.
 *
 * Esta marca existe para um teste conferir exatamente isso: ela não pode
 * aparecer em nenhuma página que não seja a do jogo.
 */
export const MARCA_DO_CLIENTE = "__MORADA_CLIENTE__";

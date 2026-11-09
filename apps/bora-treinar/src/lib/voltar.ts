"use client";

/**
 * Quantas telas a pessoa já abriu dentro do app nesta aba. `FocusNav` conta a cada troca de
 * endereço. Quem chega por um link direto (e-mail, favorito, QR) começa em 1: ali, "voltar" com
 * `router.back()` saía do app ou não fazia nada.
 */
let telas = 0;
export function contarTela() {
  telas += 1;
}

/** Volta uma tela se ela foi aberta dentro do app; senão, vai ao destino explícito. */
export function voltar(router: { back(): void; push(href: string): void }, fallback: string) {
  if (telas > 1) router.back();
  else router.push(fallback);
}

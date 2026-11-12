/**
 * A pessoa pediu menos movimento ao sistema. O HUD obedece pelo CSS; a cena,
 * por aqui: os corpos param de balançar e de pulsar, e os anéis ficam parados.
 * Andar de um lugar a outro continua, porque isso é o jogo.
 */
export function pedeMenosMovimento(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

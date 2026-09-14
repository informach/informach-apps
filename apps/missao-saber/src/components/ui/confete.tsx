"use client";

/**
 * Celebração da conclusão de missão. CSS puro, 14 peças, 900ms.
 * O bloco `prefers-reduced-motion` de globals.css anula a animação, então
 * quem pede movimento reduzido simplesmente não vê nada se mexer.
 */
const CORES = [
  "var(--ms-verde)",
  "var(--ms-lima)",
  "var(--ms-sol)",
  "var(--ms-uva)",
  "var(--ms-coral)",
  "var(--ms-ceu)",
];

const PECAS = Array.from({ length: 14 }, (_, i) => ({
  id: `confete-${i}`,
  esquerda: 6 + i * 6.6,
  cor: CORES[i % CORES.length],
  dx: `${(i % 2 === 0 ? 1 : -1) * (12 + (i % 5) * 9)}px`,
  giro: `${(i % 2 === 0 ? 1 : -1) * (180 + i * 24)}deg`,
  duracao: 900 + (i % 4) * 160,
  atraso: i * 45,
}));

export function Confete() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden motion-reduce:hidden"
    >
      {PECAS.map((peca) => (
        <span
          key={peca.id}
          className="absolute top-0 block size-2.5 rounded-[3px]"
          style={
            {
              left: `${peca.esquerda}%`,
              background: peca.cor,
              "--dx": peca.dx,
              "--rot": peca.giro,
              animation: `confete-cair ${peca.duracao}ms ease-in ${peca.atraso}ms both`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Os poucos ícones do HUD, desenhados aqui para o package não depender de uma biblioteca. */

const TRACOS = {
  pausa: "M8 5v14M16 5v14",
  paredes: "M3 20V9l9-6 9 6v11M3 20h18M9 20v-6h6v6",
  mira: "M12 3v4M12 17v4M3 12h4M17 12h4M12 12m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0",
  bairro:
    "M9 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 20a6 6 0 0 1 12 0M17 9m-2.3 0a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0M16.5 14.3a5 5 0 0 1 4.5 5",
  sair: "M10 4H5v16h5M14 8l4 4-4 4M18 12H9",
  fechar: "M6 6l12 12M18 6L6 18",
  sino: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20.5a2 2 0 0 0 4 0",
  alerta: "M12 4l9 16H3zM12 10v4M12 17v.5",
} as const;

export type NomeDoIcone = keyof typeof TRACOS;

export function Icone({ nome, tamanho = 16 }: { nome: NomeDoIcone; tamanho?: number }) {
  return (
    <svg
      className="morada-icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={TRACOS[nome]} />
    </svg>
  );
}

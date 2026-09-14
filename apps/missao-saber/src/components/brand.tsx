import Link from "next/link";

/** Marca do app: foguete-livro com a estrela, herdado de public/brand-master.png. */
function MarcaSimbolo({ tamanho = 40 }: { tamanho?: number }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={tamanho}
      height={tamanho}
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="48" height="48" rx="14" fill="var(--ms-verde-fundo)" />
      <path d="M24 7 L26 12 L31 14 L26 16 L24 21 L22 16 L17 14 L22 12 Z" fill="#FFFFFF" />
      <path d="M24 22 C20 18 14 17 9 18 L9 36 C14 35 20 36 24 40 Z" fill="var(--ms-lima)" />
      <path d="M24 22 C28 18 34 17 39 18 L39 36 C34 35 28 36 24 40 Z" fill="var(--ms-lima)" />
      <path
        d="M24 22 L24 40"
        stroke="var(--ms-verde-fundo)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({ compacto = false }: { compacto?: boolean }) {
  return (
    <Link
      className="inline-flex items-center gap-2.5 rounded-controle no-underline"
      href="/"
      aria-label="Missão Saber, início"
    >
      <MarcaSimbolo tamanho={compacto ? 34 : 42} />
      <span className="font-display leading-tight font-semibold text-tinta">
        <span className={compacto ? "text-lg" : "text-xl"}>
          missão <span className="text-verde">saber</span>
        </span>
        {!compacto && (
          <span className="block text-[0.62rem] font-semibold tracking-[0.14em] text-tinta-suave uppercase">
            uma descoberta por dia
          </span>
        )}
      </span>
    </Link>
  );
}

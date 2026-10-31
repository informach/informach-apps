import type { ReactNode } from "react";

/* Ícones de traço, na cor da esfera; decorativos, o título do cartão já diz tudo. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-sphere"
    >
      {children}
    </svg>
  );
}

const PRINCIPLES: readonly { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Você confere antes",
    body: "A IA sugere e organiza. Quem decide o que entra na rotina é você.",
    icon: (
      <Icon>
        <path d="M9 11l3 3 8-8" />
        <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
      </Icon>
    ),
  },
  {
    title: "Criança protegida",
    body: "O perfil da criança fica na conta de um adulto, e não há publicidade dirigida a ela.",
    icon: (
      <Icon>
        <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
        <circle cx="12" cy="10" r="2.2" />
        <path d="M8.5 15.5c.8-1.4 2-2 3.5-2s2.7.6 3.5 2" />
      </Icon>
    ),
  },
  {
    title: "Preço às claras",
    body: "O valor está na página e o cancelamento fica na sua conta. O acesso segue até o fim do período pago.",
    icon: (
      <Icon>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </Icon>
    ),
  },
  {
    title: "Uma conta Informach",
    body: "O mesmo login entra na Missão Saber, na Agenda da Turma, no Cozya, no Bora Treinar e na Suíte Edi.",
    icon: (
      <Icon>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" />
      </Icon>
    ),
  },
];

export function Principles() {
  return (
    <section aria-labelledby="jeito-titulo" className="bg-sand">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 md:py-28 lg:px-10">
        <div className="grid max-w-[760px] gap-3.5">
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-sphere-ink">
            O nosso jeito
          </p>
          <h2
            id="jeito-titulo"
            className="text-balance text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink md:text-[52px]"
          >
            O que vale em todos os produtos.
          </h2>
        </div>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3 p-0">
          {PRINCIPLES.map((principle) => (
            <li
              key={principle.title}
              className="grid content-start gap-2.5 rounded-[22px] bg-paper p-6 text-ink"
            >
              {principle.icon}
              <h3 className="text-[21px] font-extrabold tracking-[-0.01em]">{principle.title}</h3>
              <p className="text-[15px] text-ink-soft">{principle.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

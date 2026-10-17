import Image from "next/image";
import { SISTEMA_ZERO } from "@/lib/products";

const STEPS = [
  ["Jogar", "Conhece o jogo que vai construir."],
  ["Experimentar", "Testa a regra com a explicação ao lado."],
  ["Programar", "Transforma a ideia em regra, passo a passo."],
  ["Testar e continuar", "Segue para as outras partes do projeto."],
  ["Criar novas ideias", "Usa o que aprendeu nas próprias criações."],
] as const;

const TOOLS = ["Estúdio", "Pinta", "Pensa", "Molda"] as const;

function Logo({ className }: { className: string }) {
  return (
    <>
      <Image
        src="/sistema-zero/logo-claro.svg"
        alt="Sistema Zero Kids"
        width={300}
        height={23}
        unoptimized
        className={`dark:hidden ${className}`}
      />
      <Image
        src="/sistema-zero/logo-escuro.svg"
        alt="Sistema Zero Kids"
        width={300}
        height={23}
        unoptimized
        className={`hidden dark:block ${className}`}
      />
    </>
  );
}

export function SistemaZero() {
  return (
    <section id="sistema-zero" aria-labelledby="sz-titulo" className="bg-sz-surface text-sz-ink">
      <div className="mx-auto grid max-w-[1240px] gap-14 px-4 py-20 sm:px-6 md:py-28 lg:px-10">
        <div className="flex flex-wrap items-center gap-12">
          <div className="grid min-w-0 flex-[1_1_460px] justify-items-start gap-5">
            <Logo className="h-[22px] w-auto" />
            <p className="rounded-full border border-sz-line bg-sz-card px-3.5 py-1.5 text-sm font-extrabold">
              Comunidade dos Criadores · {SISTEMA_ZERO.ages}
            </p>
            <h2
              id="sz-titulo"
              className="text-balance font-rounded text-4xl font-black leading-[1.02] tracking-[-0.02em] md:text-[62px]"
            >
              Seu filho aprende programação{" "}
              <span className="text-sz-blue-ink">criando os próprios jogos.</span>
            </h2>
            <p className="max-w-[560px] text-lg text-sz-ink-soft">
              Ele joga o que vai construir, experimenta a regra ao lado da explicação e programa um
              passo de cada vez. Depois usa o que aprendeu nas próprias ideias e mostra para a
              turma.
            </p>
            <figure className="mt-2 flex items-center gap-3.5 rounded-[20px] border border-sz-line bg-sz-card py-3.5 pr-[18px] pl-3.5">
              <Image
                src="/sistema-zero/helena-julio.webp"
                alt="Helena e Júlio"
                width={56}
                height={56}
                className="size-14 shrink-0 rounded-full object-cover"
              />
              <figcaption className="text-[15px] leading-snug">
                “A Comunidade nasceu dos jogos que criamos com o nosso filho, André.”
                <span className="mt-0.5 block text-[13px] text-sz-ink-soft">Helena e Júlio</span>
              </figcaption>
            </figure>
          </div>
          <div
            role="img"
            aria-label="Telas reais da plataforma: o Estúdio de programação em blocos, o editor do avatar e uma aula com o Zappy."
            className="relative aspect-[600/470] min-w-0 flex-[1_1_460px] max-w-[600px]"
          >
            <Image
              src="/sistema-zero/tela-estudio.webp"
              alt=""
              width={1280}
              height={800}
              sizes="(min-width: 1024px) 400px, 70vw"
              className="absolute top-[2%] left-0 h-auto w-[66%] -rotate-[4deg] rounded-xl border border-sz-line shadow-lg"
            />
            <Image
              src="/sistema-zero/tela-avatar.webp"
              alt=""
              width={1280}
              height={800}
              sizes="(min-width: 1024px) 400px, 70vw"
              className="absolute top-[10%] right-0 h-auto w-[62%] rotate-[3deg] rounded-xl border border-sz-line shadow-lg"
            />
            <Image
              src="/sistema-zero/tela-aula.webp"
              alt=""
              width={1280}
              height={800}
              sizes="(min-width: 1024px) 460px, 80vw"
              className="absolute bottom-0 left-[12%] h-auto w-[72%] rounded-xl border border-sz-line shadow-2xl"
            />
            <Image
              src="/sistema-zero/zappy.webp"
              alt=""
              width={360}
              height={458}
              sizes="(min-width: 640px) 114px, 19vw"
              className="absolute right-[2%] bottom-[-4%] h-auto w-[19%]"
            />
          </div>
        </div>

        <ol
          aria-label="Como a criança aprende"
          className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3 p-0"
        >
          {STEPS.map(([title, body], index) => {
            const last = index === STEPS.length - 1;
            return (
              <li
                key={title}
                className={
                  last
                    ? "grid gap-1.5 rounded-[20px] bg-sz-blue p-5 text-white"
                    : "grid gap-1.5 rounded-[20px] border border-sz-line bg-sz-card p-5"
                }
              >
                <span
                  className={`font-rounded text-[28px] font-black leading-none ${last ? "" : "text-sz-blue-ink"}`}
                >
                  {index + 1}
                </span>
                <strong className="text-lg">{title}</strong>
                <span className={`text-sm ${last ? "text-[#E2EAFF]" : "text-sz-ink-soft"}`}>
                  {body}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
          <div className="grid content-start gap-3 rounded-[22px] border border-sz-line bg-sz-card p-6">
            <h3 className="font-rounded text-[22px] font-black">Ferramentas de criador</h3>
            <div className="flex flex-wrap gap-2">
              {TOOLS.map((tool) => (
                <span key={tool} className="rounded-full bg-sz-chip px-3 py-1.5 text-sm font-bold">
                  {tool}
                </span>
              ))}
              <span className="rounded-full bg-sz-sun px-3 py-1.5 text-sm font-bold">
                Zappy, a ajuda com IA
              </span>
            </div>
            <p className="text-sm text-sz-ink-soft">
              Programação em blocos, desenho, plano de projeto e 3D. Algumas ferramentas abrem
              conforme a Jornada do Criador avança.
            </p>
          </div>
          <div className="grid content-start gap-3 rounded-[22px] border border-sz-line bg-sz-card p-6">
            <h3 className="font-rounded text-[22px] font-black">Uma turma para criar junto</h3>
            <p className="text-[15px] text-sz-ink-soft">
              O Mural dos Criadores mostra os jogos dos colegas, o Clube tem o desafio do mês e os
              Recados levam as dúvidas até a equipe.
            </p>
          </div>
          <div className="grid content-start gap-3 rounded-[22px] border border-sz-line bg-sz-card p-6">
            <h3 className="font-rounded text-[22px] font-black">Pais por perto</h3>
            <p className="text-[15px] text-sz-ink-soft">
              A Área dos pais mostra o que a criança fez na semana. Sem perfilamento nem publicidade
              dirigidos a crianças, e a conta dela fica ligada a um adulto.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-7 rounded-[28px] bg-[#012C73] p-6 text-white md:p-11 dark:bg-[#0A1F4D]">
          <div className="grid min-w-0 flex-[1_1_420px] gap-2">
            <p className="font-rounded text-[26px] font-black leading-tight md:text-4xl">
              Comunidade dos Criadores
            </p>
            <p className="text-[17px] text-[#D5DEF5]">
              <strong className="text-white">{SISTEMA_ZERO.monthly} por mês</strong> ou{" "}
              <strong className="text-white">{SISTEMA_ZERO.annual} por ano</strong> (
              {SISTEMA_ZERO.annualPerMonth} por mês). Até dois perfis de criança. Sete dias para
              conhecer, com reembolso integral.
            </p>
            <p className="text-sm text-[#C3CFEC]">
              Para usar no computador, com mouse e teclado. Quer começar menor? O Desafio do
              Primeiro Jogo tem pagamento único e 30 dias de acesso.
            </p>
          </div>
          <div className="grid flex-[0_1_300px] gap-2.5">
            <a
              href={SISTEMA_ZERO.communityOffer}
              className="flex min-h-[54px] items-center justify-center rounded-full bg-[#0062D6] px-[22px] font-extrabold text-white no-underline ring-1 ring-white/30"
            >
              Entrar na Comunidade
            </a>
            <a
              href={SISTEMA_ZERO.challengeOffer}
              className="flex min-h-[54px] items-center justify-center rounded-full border-2 border-white/40 px-[22px] font-bold text-white no-underline"
            >
              Começar pelo Desafio
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

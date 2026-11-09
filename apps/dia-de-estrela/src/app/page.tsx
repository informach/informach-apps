import { PRODUCTS } from "@informach/config";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import { BellRing, Footprints, Gift, ShieldCheck, Smartphone, Volume2 } from "lucide-react";
import Link from "next/link";
import { Bau, Estrela, Lumi } from "@/components/desenhos";
import { brl } from "@/domain/estrelas";
import { getDeviceIdentity } from "@/features/aparelho/server";
import { getCurrentUser } from "@/lib/auth";

const recursos = [
  {
    Ic: Footprints,
    titulo: "Uma coisa de cada vez",
    texto: "A tarefa da vez ocupa a tela. O passo a passo é lido em voz alta, um passo por tela.",
  },
  {
    Ic: BellRing,
    titulo: "Lembretes que avisam antes",
    texto:
      "“Daqui a 5 minutos é hora do banho. Pode ir terminando.” Depois, no horário, com o que separar.",
  },
  {
    Ic: Volume2,
    titulo: "A voz de vocês",
    texto: "Grave “Filho, hora da lição!” e o tablet chama com a sua voz.",
  },
  {
    Ic: Gift,
    titulo: "Estrelas que viram recompensa",
    texto:
      "Cada tarefa vale estrelas. Na loja, vocês decidem: dinheiro, tempo de tela, um passeio.",
  },
  {
    Ic: Smartphone,
    titulo: "Pais avisados no celular",
    texto:
      "Esqueceu o banho? Você recebe o alerta e lembra de novo pelo celular, sem gritar pela casa.",
  },
  {
    Ic: ShieldCheck,
    titulo: "Só soma, nunca tira",
    texto: "Nada de castigo nem ofensiva que zera. Dia ruim não apaga estrela.",
  },
];

export default async function Inicio() {
  const [user, device] = await Promise.all([getCurrentUser(), getDeviceIdentity()]);
  const mensal =
    PRODUCTS.find((p) => p.id === "estrela_family_monthly")?.listPrice?.amountCents ?? 0;
  const anual = PRODUCTS.find((p) => p.id === "estrela_family_annual")?.listPrice?.amountCents ?? 0;
  return (
    <div className="min-h-dvh bg-creme">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-5 sm:px-8">
        <span className="flex items-center gap-2">
          <Lumi tamanho={40} />
          <span className="font-display text-2xl font-extrabold">Dia de Estrela</span>
        </span>
        <span className="flex-1" />
        {device ? (
          <Link href="/crianca" className="bp bp-claro">
            Tela da criança
          </Link>
        ) : (
          <Link href="/conectar" className="bp bp-claro">
            Tenho um código
          </Link>
        )}
        <Link href={user ? "/inicio" : "/entrar"} className="bp bp-ceu">
          {user ? "Área dos pais" : "Entrar"}
        </Link>
      </header>

      <main id="conteudo">
        <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-8 sm:px-8 lg:grid-cols-2 lg:py-16">
          <div>
            <h1 className="font-display text-5xl leading-[1.02] font-extrabold sm:text-6xl">
              A rotina da criança, uma estrela de cada vez.
            </h1>
            <p className="mt-4 max-w-xl text-xl font-semibold text-tinta-suave">
              Rotina visual com passo a passo falado, lembretes gentis e estrelas que viram
              recompensa. Feito pensando em crianças autistas e com TDAH, e bom para qualquer
              criança que se perde na rotina.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/entrar" className="b3 b3-folha b3-lg normal-case tracking-normal">
                Começar grátis
              </Link>
              <a href="#planos" className="b3 b3-claro b3-lg normal-case tracking-normal">
                Ver planos
              </a>
            </div>
            <p className="mt-3 font-bold text-tinta-suave">Grátis para uma criança. Sem cartão.</p>
          </div>
          <div className="chapa relative flex flex-col gap-4 border-ceu-borda p-6 shadow-[0_8px_0_var(--de-ceu-borda)]">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-ceu-escuro px-4 py-1.5 text-sm font-extrabold tracking-[0.08em] text-white">
                AGORA · 15:30
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-estrela-clara px-3 py-1.5 font-extrabold text-estrela-texto">
                <Estrela tamanho={18} /> vale 5 estrelas
              </span>
            </div>
            <p className="font-display text-5xl font-extrabold">Lição de casa</p>
            <div className="flex items-center gap-3">
              <Lumi tamanho={64} />
              <p className="rounded-2xl bg-ceu-claro px-4 py-3 text-lg font-bold">
                Bora? São 4 passos. Eu leio cada um com você.
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-creme p-3">
              <Bau largura={56} />
              <span className="font-display text-lg font-extrabold">Baú do dia · 5 de 12</span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recursos.map(({ Ic, titulo, texto }) => (
              <li key={titulo} className="cartao p-5">
                <Ic className="size-7 text-ceu-escuro" aria-hidden="true" />
                <h2 className="mt-2 font-display text-2xl font-extrabold">{titulo}</h2>
                <p className="mt-1 font-semibold text-tinta-suave">{texto}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="planos" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-10 sm:px-8">
          <h2 className="font-display text-4xl font-extrabold">Planos</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="cartao p-6">
              <h3 className="font-display text-2xl font-extrabold">Gratuito</h3>
              <p className="font-display text-3xl font-extrabold">R$ 0</p>
              <p className="mt-2 font-semibold text-tinta-suave">
                Uma criança, rotinas prontas e próprias, passo a passo com voz, lembretes no tablet,
                modo calmo, estrelas, cofrinho e baú do dia.
              </p>
            </div>
            <div className="cartao border-estrela p-6">
              <h3 className="font-display text-2xl font-extrabold">Família</h3>
              <p className="font-display text-3xl font-extrabold">
                {brl(mensal)}/mês{" "}
                <span className="text-lg text-tinta-suave">ou {brl(anual)}/ano</span>
              </p>
              <p className="mt-2 font-semibold text-tinta-suave">
                Até 4 crianças, segundo responsável, alertas no celular dos pais, voz dos pais nos
                lembretes, loja com recompensas próprias e foto da meta.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4 py-8 text-sm font-bold text-tinta-suave sm:px-8">
        <span>Informach · Helena e Júlio</span>
        <Link href="/termos" className="underline">
          Termos
        </Link>
        <Link href="/privacidade" className="underline">
          Privacidade
        </Link>
        <a href={INFORMACH_CONTACT.directMessageUrl} className="underline">
          Fale com a gente no Instagram
        </a>
      </footer>
    </div>
  );
}

import Image from "next/image";
import type { ReactNode } from "react";
import { ProductMark } from "@/components/marketing/product-mark";
import { StartChooserClient } from "@/components/marketing/start-chooser-client";
import { productBySlug, SISTEMA_ZERO, type SiteProduct } from "@/lib/products";

function Panel({
  product,
  title,
  body,
  price,
  cta,
  ctaClassName,
  visual,
}: {
  product: SiteProduct;
  title: string;
  body: string;
  price: ReactNode;
  cta: { label: string; href: string };
  ctaClassName: string;
  visual: ReactNode;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-8 rounded-[28px] bg-paper p-6 text-ink md:p-11">
      <div className="grid min-w-0 flex-[1_1_420px] justify-items-start gap-4">
        <span className="inline-flex items-center gap-3 text-xl font-extrabold">
          <ProductMark product={product} size={44} />
          {product.name}
        </span>
        <h3 className="text-balance text-[26px] font-extrabold leading-tight tracking-[-0.02em] md:text-4xl">
          {title}
        </h3>
        <p className="text-ink-soft">{body}</p>
        <p className="text-[15px]">{price}</p>
        <a
          href={cta.href}
          className={`inline-flex min-h-[52px] items-center rounded-full px-[22px] py-2.5 leading-tight font-extrabold no-underline ${ctaClassName}`}
        >
          {cta.label}
        </a>
      </div>
      <div className="min-w-0 flex-[1_1_380px]">{visual}</div>
    </div>
  );
}

function Task({ color, title, detail }: { color: string; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-sand p-3">
      <span aria-hidden className="h-9 w-2.5 shrink-0 rounded" style={{ background: color }} />
      <span>
        <strong className="block">{title}</strong>
        <span className="text-[13px] text-ink-muted">{detail}</span>
      </span>
    </div>
  );
}

export function StartChooser() {
  const options = [
    {
      id: "jogos",
      label: "Meu filho quer criar jogos",
      panel: (
        <Panel
          product={productBySlug("sistema-zero")}
          title="Seu filho aprende programação criando os próprios jogos."
          body={`Comunidade dos Criadores, de ${SISTEMA_ZERO.ages}. Aulas com explicação e prática juntas, o Estúdio para programar em blocos e uma turma para mostrar o que criou.`}
          price={
            <>
              <strong>{SISTEMA_ZERO.monthly} por mês</strong> ou {SISTEMA_ZERO.annual} por ano ·
              sete dias para conhecer com reembolso integral
            </>
          }
          cta={{ label: "Conhecer o Sistema Zero", href: "#sistema-zero" }}
          ctaClassName="bg-sz-blue text-white"
          visual={
            <Image
              src="/sistema-zero/tela-aula.webp"
              alt="Uma aula do Sistema Zero, com o vídeo de um lado e a experiência do outro."
              width={1280}
              height={800}
              sizes="(min-width: 1024px) 520px, 100vw"
              className="h-auto w-full rounded-2xl border border-line-warm"
            />
          }
        />
      ),
    },
    {
      id: "olimpiada",
      label: "Vai ter olimpíada na escola",
      panel: (
        <Panel
          product={productBySlug("missao-saber")}
          title="Treino de olimpíada no ritmo da criança."
          body="Trilhas de estratégia para OBMEP, OBMEP Mirim, Canguru e OLITEF, do 2º ano do fundamental à 3ª série do médio, com revisões nos dias certos e simulados."
          price={<strong>{productBySlug("missao-saber").price}</strong>}
          cta={productBySlug("missao-saber").cta}
          ctaClassName="bg-[#1E5A44] text-white"
          visual={
            /* No celular os números viram linhas: em três colunas, "2.960" não cabe abaixo de ~460px. */
            <div className="grid gap-2.5 min-[460px]:grid-cols-3">
              {[
                ["291", "missões"],
                ["2.960", "atividades autorais"],
                ["4", "olimpíadas cobertas"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="flex items-baseline gap-3 rounded-[18px] bg-[#1E5A44] px-4 py-3 text-[#EAF6DD] min-[460px]:grid min-[460px]:gap-1 min-[460px]:p-4"
                >
                  <strong className="text-3xl leading-none">{value}</strong>
                  <span className="text-[13px]">{label}</span>
                </div>
              ))}
            </div>
          }
        />
      ),
    },
    {
      id: "recados",
      label: "Os recados da escola não param",
      panel: (
        <Panel
          product={productBySlug("agenda-da-turma")}
          title="O recado da escola vira o que fazer, até quando e quem cuida."
          body="Mande a foto da agenda, cole a mensagem ou exporte a conversa do WhatsApp. Você confere e a rotina da semana se organiza."
          price={<strong>{productBySlug("agenda-da-turma").price}</strong>}
          cta={productBySlug("agenda-da-turma").cta}
          ctaClassName="bg-[#0066EB] text-white"
          visual={
            <div
              role="img"
              aria-label="Exemplo da lista Para cuidar hoje, com uma tarefa de Matemática, uma prova e uma autorização."
              className="grid gap-2.5 rounded-[22px] border border-line-warm bg-surface p-5"
            >
              <p className="text-xs font-extrabold tracking-[0.08em] text-ink-muted">
                PARA CUIDAR HOJE
              </p>
              <Task
                color="#3B82F6"
                title="Exercícios de frações"
                detail="Matemática · para amanhã"
              />
              <Task
                color="#8B5CF6"
                title="Prova de Ciências"
                detail="Sexta-feira · estudo marcado"
              />
              <Task color="#F97316" title="Autorização do passeio" detail="Assinar até quinta" />
            </div>
          }
        />
      ),
    },
    {
      id: "jantar",
      label: "O que vai ser o jantar?",
      panel: (
        <Panel
          product={productBySlug("cozya")}
          title="Receita guardada, semana planejada, lista de compras pronta."
          body="Guarde a receita por foto, voz ou só uma ideia. Escolha os jantares da semana, ajuste as porções e saia com a lista somada."
          price={<strong>{productBySlug("cozya").price}</strong>}
          cta={productBySlug("cozya").cta}
          ctaClassName="bg-[#FF7A3D] text-[#173247]"
          visual={
            <div
              role="img"
              aria-label="Exemplo de semana planejada no Cozya, com três jantares e a lista de compras."
              className="grid grid-cols-2 gap-2.5"
            >
              {[
                ["SEGUNDA", "Frango assado com legumes"],
                ["TERÇA", "Macarrão ao sugo"],
                ["QUARTA", "Sopa de lentilha"],
              ].map(([day, meal]) => (
                <div key={day} className="rounded-[18px] border border-line-warm bg-surface p-4">
                  <p className="text-xs font-extrabold text-sphere-ink">{day}</p>
                  <p className="mt-1 font-bold">{meal}</p>
                </div>
              ))}
              <div className="rounded-[18px] bg-night p-4 text-night-ink">
                <p className="text-xs font-extrabold text-night-accent">LISTA</p>
                <p className="mt-1 font-bold">Itens somados</p>
              </div>
            </div>
          }
        />
      ),
    },
    {
      id: "aulas",
      label: "Eu gravo aulas e materiais",
      panel: (
        <Panel
          product={productBySlug("edi")}
          title="Tudo o que sua aula precisa, numa bancada só."
          body="Cinco ferramentas para Windows: grave e edite a aula pelo texto da fala, explique com prints, crie a capa, organize o PDF e anime o mascote."
          price={<strong>{productBySlug("edi").price}</strong>}
          cta={productBySlug("edi").cta}
          ctaClassName="bg-[#1F242A] text-[#F4F1EA] dark:ring-1 dark:ring-[#F4F1EA]/40"
          visual={
            <div className="flex flex-wrap items-center justify-center gap-2.5 rounded-[22px] bg-[#1F242A] p-6">
              {["#C8E64A", "#5ED3B3", "#FF8F7E", "#8CB6FF", "#C2A5FF"].map((color) => (
                <span
                  key={color}
                  aria-hidden
                  className="size-14 rounded-2xl"
                  style={{ background: color }}
                />
              ))}
              <p className="basis-full text-center text-sm text-[#C9CDD3]">
                Aula · Captura · Foto · PDF · SVG
              </p>
            </div>
          }
        />
      ),
    },
  ];
  return (
    <section id="comecar" aria-labelledby="comecar-titulo" className="bg-night text-night-ink">
      <div className="mx-auto grid max-w-[1240px] gap-9 px-4 py-16 sm:px-6 md:py-24 lg:px-10">
        <div className="grid max-w-[760px] gap-3">
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-night-accent">
            Por onde começar
          </p>
          <h2
            id="comecar-titulo"
            className="text-balance text-[32px] font-extrabold leading-tight tracking-[-0.03em] md:text-5xl"
          >
            O que está pedindo ajuda na sua casa hoje?
          </h2>
        </div>
        <StartChooserClient options={options} />
      </div>
    </section>
  );
}

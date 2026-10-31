import { PRODUCTS } from "@informach/config";
import { APPS } from "@informach/config/apps";

export type Audience = "criancas" | "familia" | "quem-ensina";

export const AUDIENCE_LABEL: Record<Audience, string> = {
  criancas: "Para as crianças",
  familia: "Para a família",
  "quem-ensina": "Para quem ensina e cria",
};

export type SiteProduct = {
  slug: "sistema-zero" | "missao-saber" | "agenda-da-turma" | "cozya" | "bora-treinar" | "edi";
  name: string;
  url: string;
  audience: Audience;
  /** Frase curta do cartão: o que o produto resolve. */
  promise: string;
  facts: readonly [string, string, string];
  price: string;
  cta: { label: string; href: string };
  icon: string;
  /** Cores do próprio produto, usadas no cabeçalho do cartão. */
  brand: { background: string; foreground: string; link: string };
};

const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** Endereço público de um app do monorepo, a partir do domínio registrado em `APPS`. */
const appUrl = (app: keyof typeof APPS, path = "") => `https://${APPS[app].domain}${path}`;

function monthlyPrice(productId: string) {
  const product = PRODUCTS.find((item) => item.id === productId);
  if (!product?.listPrice) throw new Error(`Missing list price for ${productId}`);
  return brl(product.listPrice.amountCents);
}

/**
 * Sistema Zero é vendido em sistemazero.com.br, fora do catálogo do monorepo.
 * Valores conferidos na página de oferta em 17/10/2026; atualizar junto com ela.
 */
export const SISTEMA_ZERO = {
  url: "https://sistemazero.com.br/",
  communityOffer: "https://sistemazero.com.br/kids/comunidade-dos-criadores/oferta",
  challengeOffer: "https://sistemazero.com.br/kids/desafio-primeiro-jogo/oferta",
  ages: "9 a 14 anos",
  monthly: "R$ 97",
  annual: "R$ 797",
  annualPerMonth: "R$ 66,42",
} as const;

export const SITE_PRODUCTS: readonly SiteProduct[] = [
  {
    slug: "sistema-zero",
    name: "Sistema Zero",
    url: SISTEMA_ZERO.url,
    audience: "criancas",
    promise: "Seu filho aprende programação criando os próprios jogos.",
    facts: [
      `Comunidade dos Criadores, de ${SISTEMA_ZERO.ages}`,
      "Aulas com explicação e prática juntas",
      "Estúdio de blocos e uma turma para mostrar o que criou",
    ],
    price: `${SISTEMA_ZERO.monthly} por mês ou ${SISTEMA_ZERO.annual} por ano`,
    cta: { label: "Conhecer o Sistema Zero", href: "#sistema-zero" },
    icon: "/sistema-zero/zappy.webp",
    brand: { background: "#0062D6", foreground: "#FFFFFF", link: "#0062D6" },
  },
  {
    slug: "missao-saber",
    name: "Missão Saber",
    url: appUrl("missaoSaber"),
    audience: "criancas",
    promise: "Treino de olimpíada no ritmo da criança.",
    facts: [
      "OBMEP, OBMEP Mirim, Canguru e OLITEF",
      "Do 2º ano do fundamental à 3ª série do médio",
      "Revisões nos dias certos e simulados",
    ],
    price: `A partir de ${monthlyPrice("missao_individual_monthly")} por mês`,
    cta: { label: "Conhecer a Missão Saber", href: appUrl("missaoSaber") },
    icon: "/produtos/missao-saber.png",
    brand: { background: "#1E5A44", foreground: "#EAF6DD", link: "#1E5A44" },
  },
  {
    slug: "agenda-da-turma",
    name: "Agenda da Turma",
    url: appUrl("agendaDaTurma"),
    audience: "familia",
    promise: "O recado da escola vira providência.",
    facts: [
      "Foto, mensagem ou conversa do WhatsApp",
      "No Pro, dois adultos, com acesso definido por criança",
      "Uma tela só para a criança marcar o que fez",
    ],
    price: `Grátis para uma criança · Pro ${monthlyPrice("agenda_da_turma_pro_monthly")} por mês`,
    cta: { label: "Conhecer a Agenda", href: appUrl("agendaDaTurma") },
    icon: "/produtos/agenda-da-turma.svg",
    /* Azul da Agenda um tom abaixo de #006FFD: o texto branco de 13px precisa de 4,5:1 (fica 5,1:1). */
    brand: { background: "#0066EB", foreground: "#FFFFFF", link: "#0057C8" },
  },
  {
    slug: "cozya",
    name: "Cozya",
    url: appUrl("cozya"),
    audience: "familia",
    promise: "O jantar da semana decidido no domingo.",
    facts: [
      "Receita guardada por foto, voz ou ideia",
      "Semana planejada e porções ajustadas",
      "Lista de compras somada e modo de preparo",
    ],
    price: `14 dias sem cartão · Pro ${monthlyPrice("cozya_pro_monthly")} por mês`,
    cta: { label: "Conhecer o Cozya", href: appUrl("cozya") },
    icon: "/produtos/cozya.svg",
    brand: { background: "#FF7A3D", foreground: "#173247", link: "#B4501C" },
  },
  {
    slug: "bora-treinar",
    name: "Bora Treinar",
    url: appUrl("boraTreinar"),
    audience: "familia",
    promise: "O treino da família na sala de casa.",
    facts: [
      "Instrutor 3D que mostra cada movimento",
      "A câmera conta as repetições no próprio aparelho",
      "Perfis, níveis e um desafio por semana",
    ],
    price: `Primeiro treino grátis · a partir de ${monthlyPrice("bora_individual_monthly")} por mês`,
    cta: { label: "Conhecer o Bora Treinar", href: appUrl("boraTreinar") },
    icon: "/produtos/bora-treinar.png",
    /* O verde-limão do Bora não lê sobre o papel claro: o link usa um verde-oliva (6,2:1). */
    brand: { background: "#0B0D10", foreground: "#C8FF2E", link: "#4A6B00" },
  },
  {
    slug: "edi",
    name: "Suíte Edi",
    url: appUrl("edi"),
    audience: "quem-ensina",
    promise: "A aula inteira numa bancada só.",
    facts: [
      "Grave e edite a aula pelo texto da fala",
      "Prints explicados, capas, PDFs e vetores",
      "Para Windows, arquivos no seu computador",
    ],
    price: `${monthlyPrice("edi_suite_monthly")} por mês`,
    cta: { label: "Conhecer a Suíte Edi", href: appUrl("edi") },
    icon: "/produtos/edi.png",
    brand: { background: "#1F242A", foreground: "#F4F1EA", link: "#173247" },
  },
];

export function productBySlug(slug: SiteProduct["slug"]) {
  const product = SITE_PRODUCTS.find((item) => item.slug === slug);
  if (!product) throw new Error(`Unknown product ${slug}`);
  return product;
}

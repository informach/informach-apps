# `@informach/informach-site`: guia do app

> Documentação primária do app. Para o root do monorepo ver [`/CLAUDE.md`](../../CLAUDE.md). Para regras comuns ver [`/AGENTS.md`](../../AGENTS.md) e [`apps/AGENTS.md`](../AGENTS.md).

---

## 1. Propósito

Site institucional da **Informach Núcleo de Aprendizagem Ltda** (CNPJ 43.588.758/0001-03), em `informach.com.br`. **Não é um SaaS**: sem auth, sem billing, sem banco, sem IA, sem RBAC.

Razões para existir:
1. **Apresentar a casa e os cinco produtos**: Sistema Zero (Comunidade dos Criadores, para crianças de 9 a 14 anos), Missão Saber, Agenda da Turma, Cozya e Suíte Edi. A home ajuda a família a escolher por onde começar.
2. **Termos e Privacidade guarda-chuva** que cobrem a holding e o serviço de cobrança via Stripe. Após o deploy, o Customer Portal do Stripe é reapontado para `informach.com.br/{termos,privacidade}`.
3. **Quem faz**: Helena e Júlio, desenvolvedores e pais do André, e o canal público de contato.

O Sistema Zero é vendido em `sistemazero.com.br`, fora deste monorepo. A home leva para as páginas de oferta reais dele; não existe login de aluno aqui.

---

## 2. Stack

| Item | Versão / nota |
|---|---|
| Next | 16 (App Router, Turbopack, `output: "standalone"`) |
| React | 19 |
| Tailwind | v4 |
| `@informach/ui` | workspace (TS source): ThemeProvider, ModeToggle, Sheet |
| `@informach/config` | workspace (TS source): preços do catálogo (`PRODUCTS`) e contato público (`@informach/config/contact`) |
| Fontes | Plus Jakarta Sans (texto, `--font-jakarta`) e Nunito 800/900 (seção do Sistema Zero, `--font-nunito`), via `next/font` no `<html>` |
| `lucide-react` | ícone do menu |
| Port dev | 3004 |
| Domínio prod | `informach.com.br` |

As variáveis das fontes ficam no `<html>`, não no `<body>`: `globals.css` monta `--font-sans` e `--font-rounded` no `:root`, e a variável só resolve se estiver definida no mesmo elemento.

**Sem**: Sentry, Better Auth, Drizzle, validação de env, provedores de IA. Se for adicionar qualquer um desses, **questione a decisão**: provavelmente o conteúdo pertence a um app dedicado.

---

## 3. Estrutura

```
apps/informach-site/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # ThemeProvider, fontes, metadata, viewport, JSON-LD
│   │   ├── globals.css             # tokens "Feito em casa" e do Sistema Zero, claro e escuro
│   │   ├── favicon.ico / icon.png / apple-icon.png
│   │   ├── opengraph-image.tsx     # 1200x630 via next/og
│   │   ├── sitemap.ts / robots.ts
│   │   └── (marketing)/
│   │       ├── layout.tsx          # SiteHeader + main#main + SiteFooter + skip link
│   │       ├── page.tsx            # Hero → StartChooser → SistemaZero → Products → Principles → Founders → FinalCta
│   │       ├── termos/page.tsx
│   │       └── privacidade/page.tsx
│   ├── components/marketing/
│   │   ├── site-header.tsx         # logo, âncoras, ModeToggle, CTA
│   │   ├── site-header-mobile-nav.tsx # gaveta (ilha "use client")
│   │   ├── site-footer.tsx         # produtos, empresa, identidade legal
│   │   ├── hero.tsx                # título, Helena e Júlio, órbita com os cinco produtos
│   │   ├── start-chooser.tsx       # painéis "O que está pedindo ajuda na sua casa hoje?" (servidor)
│   │   ├── start-chooser-client.tsx # botões de situação (ilha "use client")
│   │   ├── sistema-zero.tsx        # Comunidade dos Criadores: método, ferramentas, turma, pais, preço
│   │   ├── products.tsx            # cartões da Missão Saber, Agenda, Cozya e Edi
│   │   ├── principles.tsx          # "O que vale em todos os produtos"
│   │   ├── founders.tsx            # Quem faz + #contato (direct do Instagram)
│   │   ├── final-cta.tsx
│   │   ├── product-mark.tsx        # ícone de cada produto (Sistema Zero usa o Zappy)
│   │   ├── direct-link.tsx         # link @criecomhelenaejulio das páginas legais
│   │   └── informach-logo.tsx      # wordmark claro/escuro, `tone="onDark"` para fundos escuros
│   └── lib/
│       ├── site.ts                 # nome, razão social, CNPJ, URL, tagline, contato
│       └── products.ts             # SITE_PRODUCTS, SISTEMA_ZERO, públicos e preços
├── assets/og/                      # fontes, aviso de licença e Zappy em PNG da imagem social
└── public/
    ├── logo-informach-{light,dark}.svg
    ├── produtos/                   # ícones de Missão Saber, Agenda, Cozya e Edi
    └── sistema-zero/               # logos claro/escuro, foto de Helena e Júlio, telas reais, Zappy
```

---

## 4. Identidade visual

Direção "Feito em casa", aprovada em 17/10/2026 na proposta em canvas: papel, marinho e o laranja da esfera do ícone. Tokens em `globals.css`, com versão escura completa em `.dark`:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `paper` | `#f8f5ef` | `#0e1a25` | fundo da página |
| `sand` | `#efe8dc` | `#13212e` | faixa dos princípios |
| `surface` | `#ffffff` | `#162736` | cartões |
| `ink` / `ink-soft` / `ink-muted` | marinho `#173247` e tons | claros | texto |
| `sphere` / `sphere-ink` | `#c65a24` / `#8a4a23` | `#e57a45` / `#f0a979` | laranja da esfera; `sphere-ink` para texto pequeno |
| `sphere-strong` | `#b4501c` | `#e57a45` | fundo de botão com texto de 16px: branco sobre a esfera dá só 4,3:1 |
| `night` | `#173247` | `#0a141d` | seletor e rodapé |
| `sz-*` | azul do Sistema Zero | variação escura | seção do Sistema Zero |

Cada produto aparece com a cor do próprio site (`brand` em `products.ts`), ajustada quando o texto branco não chega a 4,5:1: a Agenda usa `#0066EB` (5,1:1) em vez do `#006FFD` do app (4,48:1). O Sistema Zero usa as cores do logotipo oficial (`#012C73`, `#0074FC`, `#FDB002`) e a Nunito, como no site dele. Em fundo escuro, o link do cartão usa `ink`, porque as cores de marca não têm contraste ali.

A Plus Jakarta Sans tem espaço largo antes de vírgula e ponto em tamanho grande. É o desenho da fonte, o mesmo nos outros apps; não compensar com margens negativas.

---

## 5. Logos e imagens

- Wordmark `public/logo-informach-{light,dark}.svg`: assets oficiais. **Não modificar conteúdo.** Renderizados com `next/image` **`unoptimized`** (sem isso o SVG era rasterizado e perdia qualidade). Troca claro/escuro por CSS (`dark:hidden` / `hidden dark:block`). No rodapé, sempre escuro, usar `tone="onDark"`.
- `public/sistema-zero/`: logos e telas reais baixados de `sistemazero.com.br` em 17/10/2026. Os SVGs dos logos receberam só um `<title>` para acessibilidade. As telas são composição de vitrine, não captura ao vivo; atualizar quando a plataforma mudar de cara.
- `public/produtos/`: ícones copiados dos próprios apps (Cozya e Agenda em SVG, Missão Saber e Edi em PNG).
- Ícones do navegador em `src/app/` pelas convenções de metadata do Next 16. Não há `manifest.ts` nem service worker (não é PWA).

---

## 6. SEO

- **Metadata** estática no root layout (`TITLE`, `DESCRIPTION`, `openGraph`, `twitter`, `robots`, `metadataBase`, `alternates.canonical`).
- **`viewport`** exportado separado, com `themeColor` igual ao `paper` claro e escuro.
- **JSON-LD** `Organization` + `WebSite` no `<body>`. Sem e-mail: o `contactPoint` aponta para o direct do Instagram, e `sameAs` lista o Instagram e as URLs dos cinco produtos (`SITE_PRODUCTS`).
- **`opengraph-image.tsx`**: a peça "Compartilhamento" do canvas aprovado. Marinho, órbita tracejada, esfera, wordmark, "Feito em casa, para a sua família." e os ícones dos cinco produtos. Gerada no build (rota estática). Regras:
  - Satori exige `display: flex` em todo div com mais de um filho; não usar `<br>`.
  - Fontes só de arquivo local: Plus Jakarta Sans 400 e 800 em `assets/og/` (OFL, aviso em `assets/og/LICENSE.txt`). Sem fonte da rede.
  - Satori não lê WebP: o Zappy da imagem é `assets/og/zappy.png`.
  - Cada `readFile` usa caminho literal. Caminho montado em tempo de execução faz o Next rastrear o projeto inteiro para o pacote standalone (o build avisa). Produto novo exige uma entrada em `ICONS`; sem ela, o build falha de propósito.
- **Lighthouse**: o baseline anterior (100/96 de performance, 100 nos demais, maio de 2026) é da home antiga. Medir de novo depois do deploy desta versão.

---

## 7. Conteúdo: onde editar

| Mudar | Arquivo |
|---|---|
| Razão social, CNPJ, tagline, contato | `src/lib/site.ts` (contato vem de `@informach/config/contact`) |
| Produtos: promessa, fatos, preço, CTA, cores | `src/lib/products.ts` (endereços dos apps vêm de `APPS`, em `@informach/config/apps`) |
| Preços dos apps do monorepo | `packages/config/src/products.ts` (o site lê de lá) |
| Preços e links do Sistema Zero | `SISTEMA_ZERO` em `src/lib/products.ts`, conferidos na página de oferta |
| Seletor "por onde começar" | `src/components/marketing/start-chooser.tsx` |
| Seção do Sistema Zero | `src/components/marketing/sistema-zero.tsx` |
| Princípios | `src/components/marketing/principles.tsx` |
| Quem faz e contato | `src/components/marketing/founders.tsx` |
| Termos e Privacidade | `src/app/(marketing)/{termos,privacidade}/page.tsx` |
| Cores e fontes | `src/app/globals.css` e `src/app/layout.tsx` |
| Título, descrição e JSON-LD | `src/app/layout.tsx` |

Copy em português, humanizada e **sem travessão** (nem `—` nem `–`).

---

## 8. Páginas legais (guarda-chuva)

`/termos` e `/privacidade` tratam a Informach como entidade legal e como contratante do serviço de cobrança Stripe. O Cozya, a Missão Saber e o Sistema Zero têm termos próprios (`cozya.informach.com.br/termos`, `missao-saber.informach.com.br/termos` e `sistemazero.com.br/kids/termos`), linkados na cláusula 3. A Agenda da Turma tem só a página de dados da família, que complementa a política guarda-chuva, e a Suíte Edi usa estes Termos e esta Política diretamente.

- O canal de contato e de direitos LGPD é o direct do Instagram (`DirectLink`), nunca um endereço de e-mail.
- Cláusula 12 da privacidade (revista em 17/10/2026, por decisão da titular): a conta é sempre de um adulto; crianças e adolescentes usam Missão Saber e Agenda por perfis criados e supervisionados pelo responsável, no melhor interesse deles (art. 14 da LGPD), sem publicidade nem perfis públicos. O Sistema Zero tem política própria em `sistemazero.com.br/kids/privacidade`, com a Informach como controladora. Os Termos (seção 4) remetem a essa cláusula.
- OpenRouter: a empresa é a OpenRouter, Inc. (EUA). A Informach contrata e paga; o usuário não tem conta lá. Pela política do OpenRouter, ele não guarda o conteúdo por padrão e registra metadados; os provedores de modelo têm retenção própria, então a política não promete descarte imediato. A política cita o modelo reserva da Anthropic e a busca Exa do Cozya, e diz que a IA da Suíte Edi vai do computador da pessoa direto para a conta dela no Claude ou no ChatGPT. Os Termos (seção 8) explicam a cota de créditos do Cozya e da Agenda e que a assinatura Edi não inclui IA. Ao trocar de provedor, modelo, fallback ou forma de cobrança da IA, revisar os dois textos.
- Há marcadores `TODO(legal)` para reembolso, limitação de responsabilidade e nomeação formal do encarregado. **Revisão jurídica antes do go-live continua obrigatória**; os textos acima foram escritos com base nos produtos e nas fontes públicas, não substituem essa revisão.
- Após o deploy, trocar no Stripe Dashboard (Settings → Billing → Customer Portal) as URLs de Termos e Privacidade. Operação manual, fora do código.

---

## 9. Como adicionar um produto

1. **Confirmar a URL canônica** na documentação do app. Convenção: `<app>.informach.com.br`. Não inventar.
2. Acrescentar o produto em `SITE_PRODUCTS` (`src/lib/products.ts`) com `slug`, `name`, `url`, `audience`, `promise`, três `facts`, `price` (derivado de `PRODUCTS` quando o produto está no catálogo), `cta`, `icon` e `brand`.
3. Pôr o ícone em `public/produtos/` e, se fizer sentido, uma posição em `ORBIT` (`hero.tsx`) e uma situação no seletor (`start-chooser.tsx`).
4. Rodapé, cartões e JSON-LD (`sameAs`) leem `SITE_PRODUCTS` automaticamente. A imagem social também, mas precisa do ícone em `ICONS` (`opengraph-image.tsx`), com caminho literal.
5. O sitemap só lista rotas internas; não muda.

---

## 10. Comandos

```bash
pnpm dev:informach-site                              # http://localhost:3004
pnpm build:informach-site                            # build standalone
pnpm --filter @informach/informach-site typecheck    # tsc --noEmit
```

Build estático: todas as rotas ○ (Static), inclusive `/sitemap.xml`, `/robots.txt`, `/opengraph-image`, `/icon.png` e `/apple-icon.png`. Depois de `next dev`, apagar o `AGENTS.md` que o Next gera dentro do app.

---

## 11. Regras para agentes

1. **Não adicionar deps de SaaS** (`@informach/auth`, `@informach/billing`, `@informach/db`, `@informach/ai-core`, `@sentry/nextjs`, `@t3-oss/env-nextjs` etc.). `@informach/config` é permitido: só constantes de catálogo e contato.
2. **Nenhum e-mail de contato em página pública.** O canal é o direct do Instagram `@criecomhelenaejulio`, lido de `INFORMACH_CONTACT`; não repetir o endereço nem o handle no código.
3. **URL de produto**: vem de `APPS` (`@informach/config/apps`) para os apps do monorepo; não repetir domínio no site. O Sistema Zero é externo e fica em `SISTEMA_ZERO`.
4. **Logos via `<Image unoptimized>`**; não trocar por `<img>` nem tirar o `unoptimized`. Na troca claro/escuro, as duas versões levam o mesmo `alt` quando não há rótulo em volta: a escondida sai da árvore de acessibilidade pelo `display: none`. Pré-carga com `preload` (o `priority` está obsoleto no Next 16.4) e `sizes` em toda imagem que aparece menor que o arquivo.
5. **Conteúdo legal aqui é diferente do de cada app.** Não copiar texto entre eles; este é guarda-chuva.
6. **Rota nova**: atualizar `src/app/sitemap.ts` na mesma entrega.
7. **Headline ou produtos mudaram**: conferir `/opengraph-image` visualmente.
8. **Botões que só funcionam com JavaScript** ficam `disabled` até a hidratação (`useHydrated`): os do seletor e o botão do menu do celular. Sem JavaScript, o seletor mostra o primeiro painel, o resto da página continua legível e as âncoras do rodapé seguem funcionando.
9. **Contraste**: texto pequeno sobre papel usa `ink-muted` ou `sphere-ink`; não usar opacidade em texto de 12 a 14px. Texto até 18px sobre cor de marca precisa de 4,5:1 (por isso `sphere-strong` no botão do topo). Alvos de toque com 44px, inclusive os links do rodapé; o `ModeToggle` do `@informach/ui` tem 40px.
10. **Menu do celular**: o link guarda o destino e navega depois que a gaveta fecha (`onCloseAutoFocus`). Com a gaveta aberta a rolagem fica travada e o salto da âncora se perde.
11. **`metadataBase`** só muda se o domínio mudar.
12. **Deploy e dependências:** o `watchPatterns` do serviço `informach-site` em `.railway/railway.ts` cobre o site, `packages/config`, `packages/ui` e os arquivos raiz de build. Mudanças no catálogo de preços e domínios ou no contato precisam gerar novo build do site estático.

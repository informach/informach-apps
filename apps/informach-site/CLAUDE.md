# `@informach/informach-site` — app guide

> Documentação primária do app. Para o root do monorepo ver [`/CLAUDE.md`](../../CLAUDE.md). Para o produto Cozya ver [`apps/cozya/CLAUDE.md`](../cozya/CLAUDE.md).

---

## 1. Propósito

Site institucional da **Informach — Núcleo de Aprendizagem Ltda** (CNPJ 43.588.758/0001-03). **Não é um SaaS**: sem auth, sem billing, sem banco, sem IA, sem RBAC. É uma landing pública que apresenta a empresa, lista os apps que ela opera e divulga a Comunidade Sistema Zero.

Razões pra existir:
1. **Presença institucional na web** (`informach.com.br`).
2. **Termos e Privacidade guarda-chuva** que cobrem a holding e o serviço de cobrança via Stripe — após deploy, o Customer Portal do Stripe é reapontado pra `informach.com.br/{termos,privacidade}`.
3. **Hub de descoberta dos apps**: cada produto da Informach é listado aqui com link pro seu subdomínio.

---

## 2. Stack

| Item | Versão / nota |
|---|---|
| Next | 16.2.4 (App Router, Turbopack) |
| React | 19.2.5 |
| Tailwind | v4.2.4 |
| `@informach/ui` | workspace (consumido como TS source) |
| Fonte | Plus Jakarta Sans (next/font) — compartilhada com cozya/admin |
| `lucide-react` | ^0.469 |
| Port dev | 3004 |
| Domínio prod | `informach.com.br` |

**Sem**: Sentry, Better Auth, Drizzle, env validation Zod, AI providers, organizations. Se for adicionar qualquer um desses, **questione a decisão** — provavelmente o conteúdo certo é num app dedicado, não aqui.

---

## 3. Estrutura

```
apps/informach-site/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # ThemeProvider, fonte, metadata, viewport, JSON-LD
│   │   ├── globals.css             # tokens da paleta institucional
│   │   ├── favicon.ico             # Next 16 metadata file convention
│   │   ├── icon.png                # 512x512 esfera laranja (browser tab)
│   │   ├── apple-icon.png          # mesma, 180x180 generated por Next
│   │   ├── opengraph-image.tsx     # 1200x630 dinâmica via next/og
│   │   ├── sitemap.ts              # 3 URLs estáticas
│   │   ├── robots.ts               # allow * + sitemap
│   │   └── (marketing)/
│   │       ├── layout.tsx          # SiteHeader + main#main + SiteFooter + skip link
│   │       ├── page.tsx            # Hero → Manifesto → AppsShowcase → Community → FinalCta
│   │       ├── termos/page.tsx     # Termos guarda-chuva
│   │       └── privacidade/page.tsx # Privacidade guarda-chuva (LGPD)
│   ├── components/marketing/
│   │   ├── informach-logo.tsx      # next/image unoptimized, light/dark switch
│   │   ├── site-header.tsx         # logo + nav âncora + CTA + ModeToggle
│   │   ├── site-header-mobile-nav.tsx # Sheet drawer (única ilha "use client")
│   │   ├── site-footer.tsx         # 4 colunas + identidade legal
│   │   ├── hero.tsx
│   │   ├── manifesto.tsx
│   │   ├── apps-showcase.tsx       # cards de APPS + placeholder "mais em breve"
│   │   ├── community.tsx           # Comunidade Sistema Zero
│   │   └── final-cta.tsx
│   └── lib/
│       ├── site.ts                 # SITE constants (name, legalName, cnpj, urls, contato)
│       └── apps.ts                 # APPS array (slug, name, url, status…)
└── public/
    ├── logo-informach-light.svg    # wordmark p/ tema light (498x102, ~120 KB)
    └── logo-informach-dark.svg     # wordmark p/ tema dark
```

---

## 4. Identidade visual

Paleta **institucional distinta do Cozya** — apesar de ambos usarem Plus Jakarta Sans:

| Token | Light | Dark | Notas |
|---|---|---|---|
| `--primary` | `#173247` (navy) | navy levantado | É o `--secondary` do Cozya, promovido a primary aqui |
| `--secondary` | `~#A65835` (terracota/sienna) | tom mais claro | Distinto do laranja Cozya `#FF7A3D` |
| `--ring` | navy | navy | Match com primary |

Backgrounds, foreground, border ficam herdados de `@informach/ui/styles.css` (escala de cinza compartilhada). Veja `src/app/globals.css`.

**Por que distinta**: hierarquia holding↔produto. Cozya laranja é o produto; Informach navy é a empresa. Reusar laranja na landing institucional confundiria identidade.

---

## 5. Logos e ícones

### Wordmark (light/dark)

`public/logo-informach-{light,dark}.svg` — assets oficiais entregues pela usuária. **Não modificar conteúdo.** Renomear se vier com nome diferente; tamanho/cores são intencionais.

Renderizados via `src/components/marketing/informach-logo.tsx`:
- `next/image` com **`unoptimized`** (crítico — Next 16 por default rasteriza SVG e degrada qualidade; com `unoptimized` o arquivo é servido como-é).
- Switch CSS: `dark:hidden` / `hidden dark:block` — server-rendered, sem flicker.
- `priority` ativo no header (LCP candidate).

### Ícones de browser/iOS

Em `src/app/`, seguindo Next 16 metadata file conventions:

| Arquivo | Função | Generated tag |
|---|---|---|
| `favicon.ico` | Browsers antigos / fallback | `<link rel="icon" type="image/x-icon">` |
| `icon.png` | Browser tab moderno (esfera laranja 512×512) | `<link rel="icon" type="image/png" sizes="...">` |
| `apple-icon.png` | iOS home-screen (mesma esfera) | `<link rel="apple-touch-icon" sizes="...">` |

Não há `icon.svg`, `manifest.ts` nem service worker — decisão deliberada (não é PWA).

---

## 6. SEO

### Baseline Lighthouse (build de produção, 2026-05-09)

| Métrica | Desktop | Mobile |
|---|---|---|
| Performance | 100 | 96 |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |
| LCP | 0.6 s | 2.8 s |
| CLS | 0 | 0 |

### Componentes de SEO

- **Metadata** estática no root layout (`title` template, `description`, `openGraph`, `twitter`, `robots` granular, `metadataBase`, `alternates.canonical`).
- **`viewport`** exportado **separado** de `metadata` (Next 15+ deprecou viewport dentro de metadata) com `themeColor` dual light/dark.
- **JSON-LD** Schema.org `Organization` + `WebSite` injetado no `<body>` do root layout — cobre todas as páginas. `sameAs` aponta pros subdomínios dos apps e à Comunidade.
- **`app/sitemap.ts`** — gera `/sitemap.xml` estático com 3 URLs.
- **`app/robots.ts`** — gera `/robots.txt` permissivo + sitemap + host.
- **`app/opengraph-image.tsx`** — 1200×630 dinâmica via `next/og` (`ImageResponse`), gradient navy + esfera laranja embutida em base64 + tagline.

### Regras de OG image
- Satori (engine do `next/og`) exige `display: flex` em **todos os divs com mais de um filho**. Não use `<br>` — quebre em divs separados.
- Sem fonts customizadas (usa `system-ui` inline) — evita issues de runtime no Windows e mantém o asset rápido.

---

## 7. Conteúdo — onde editar

| Mudar | Arquivo |
|---|---|
| Nome legal, CNPJ, e-mail, tagline, URL da Comunidade | `src/lib/site.ts` |
| Lista de apps (adicionar/atualizar Cozya, etc) | `src/lib/apps.ts` |
| Copy do Hero | `src/components/marketing/hero.tsx` |
| Manifesto | `src/components/marketing/manifesto.tsx` |
| Pitch da Comunidade | `src/components/marketing/community.tsx` |
| Termos guarda-chuva | `src/app/(marketing)/termos/page.tsx` |
| Privacidade guarda-chuva | `src/app/(marketing)/privacidade/page.tsx` |
| Identidade visual (cores, ring, charts) | `src/app/globals.css` |
| Schema.org / JSON-LD | `src/app/layout.tsx` (const `jsonLd`) |
| Title/description default | `src/app/layout.tsx` (const `TITLE`/`DESCRIPTION`) |

---

## 8. Páginas legais (estratégia guarda-chuva)

`/termos` e `/privacidade` tratam a Informach como entidade legal e como **contratante do serviço de cobrança Stripe**. Cobrem o site institucional + o relacionamento contratual com qualquer app pago da casa. Cada app tem **termos próprios específicos** (ex: Cozya em `cozya.informach.com.br/termos`).

Conteúdo atual contém marcadores `TODO(legal)` em pontos sensíveis (CDC art. 49 reembolso, limitação de responsabilidade, nomeação formal de DPO) — **revisão jurídica antes do go-live é obrigatória**.

Após deploy em `informach.com.br`:
1. **Stripe Dashboard → Settings → Billing → Customer Portal**: trocar URL de Termos pra `https://informach.com.br/termos` e Privacy pra `https://informach.com.br/privacidade`.
2. Operação manual, **fora do escopo do código**.

---

## 9. Como adicionar um novo app à lista

1. **Confirmar a URL canônica** na `CLAUDE.md` do app destino. Convenção do monorepo: `<app>.informach.com.br`. Não inventar — sempre ler a doc.
2. Editar `src/lib/apps.ts`:
   ```ts
   {
     slug: "novo-app",
     name: "Novo App",
     tagline: "Frase curta.",
     description: "Frase explicativa em PT-BR conversacional.",
     url: "https://novo-app.informach.com.br",
     audience: "Pra quem ___.",
     status: "live", // ou "soon"
   }
   ```
3. Atualizar `sameAs` em `src/app/layout.tsx` (JSON-LD) com a nova URL.
4. Sitemap **não** muda (continua só rotas internas) — o crawler segue os links externos.

---

## 10. Comandos

```bash
pnpm dev:informach-site                              # http://localhost:3004
pnpm build:informach-site                            # turbo build → .next/standalone
pnpm start:informach-site                            # next start (port 3004)
pnpm --filter @informach/informach-site typecheck    # tsc --noEmit
```

Build estático: 9 rotas ○ (Static), incluindo as metadata routes (`/sitemap.xml`, `/robots.txt`, `/opengraph-image`, `/icon.png`, `/apple-icon.png`).

---

## 11. Regras para agentes

1. **Não adicionar deps de SaaS** (`@informach/auth`, `@informach/billing`, `@informach/db`, `@informach/ai-core`, `@sentry/nextjs`, `@t3-oss/env-nextjs`, etc.). Este é um site público estático. Se aparecer necessidade desse tipo, é sinal que a feature pertence a um app dedicado.
2. **URL de um app na lista**: sempre confirmar na CLAUDE.md do app antes de hard-codar. Convenção é `<app>.informach.com.br`.
3. **Logos via `<Image unoptimized>`** — **não** trocar pra `<Image>` simples nem `<img>`. `unoptimized` foi a decisão depois de ver SVG sendo rasterizado e degradando.
4. **Conteúdo legal aqui ≠ no Cozya**. Não copiar texto do Cozya pra cá nem vice-versa: este é guarda-chuva (cobre Informach + Stripe), Cozya é específico do produto. Se ambos parecerem dizer a mesma coisa, é porque um deles está errado.
5. **Adicionar uma rota nova**: atualizar `src/app/sitemap.ts` na mesma PR.
6. **Mudar headline/tagline**: a OG image dinâmica é gerada a partir do código de `opengraph-image.tsx` — se a copy mudar e a OG image também precisar refletir, editar lá. Verificar visualmente abrindo `/opengraph-image`.
7. **`metadataBase`** em `src/app/layout.tsx` é o que cria a canonical URL e os `og:url` absolutos. Só alterar se o domínio mudar.
8. **A11y de contraste**: evitar `text-muted-foreground/70` ou `/80` em fonte pequena (12-14px). O combo já gerou 7 warnings no Lighthouse — usar `text-muted-foreground` direto e modular hierarquia via tamanho de fonte ou peso.
9. **Stripe Dashboard URL update** é operação manual pós-deploy. **Não é código** — não tente automatizar via Stripe API neste app.
10. **Otimização SVGO dos wordmarks** é TODO de iteração futura (~120 KB cada hoje). Se atacar, validar que o `<Image unoptimized>` ainda renderiza nítido depois.

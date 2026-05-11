# `@informach/ui` — design system

Componentes shadcn compartilhados, tokens de tema (light + dark) e a fonte/tipografia do monorepo. Único lugar onde cor, fonte, raio e sombra são definidos.

## Princípio

Componentes consomem **tokens semânticos**, nunca cores literais. Se você está prestes a escrever `bg-zinc-100`, `text-[#fff]`, `oklch(...)` ou `rgb(...)` dentro de um componente, pare — esse valor pertence a `src/styles.css` como token.

## Layout

```
packages/ui/
├── components.json              # shadcn CLI config (Tailwind v4, baseColor neutral)
├── package.json                 # private, "workspace:*", consumido como TS
├── tsconfig.json
└── src/
    ├── index.ts                 # public API mínima — só `cn`
    ├── styles.css               # tokens + utilities cross-cutting
    ├── lib/
    │   └── utils.ts             # `cn()` (clsx + tailwind-merge)
    └── components/
        ├── theme-provider.tsx   # wrapper next-themes
        ├── mode-toggle.tsx      # toggle dark/light/system (dropdown)
        ├── button.tsx
        ├── card.tsx
        ├── ...                  # 30+ componentes shadcn
        └── sonner.tsx           # Toaster com tokens
```

## Tokens

`src/styles.css` define a paleta inteira em **uma camada só** (sem brand-/sz-): `:root` para light, `.dark` para overrides escuros.

**Tokens semânticos consumidos pelos componentes:**

```
background, foreground,
card, card-foreground,
popover, popover-foreground,
primary, primary-foreground,
secondary, secondary-foreground,
muted, muted-foreground,
accent, accent-foreground,
destructive, destructive-foreground,
success, success-foreground,
warning, warning-foreground,
border, input, ring,
chart-1..5,
sidebar, sidebar-foreground,
sidebar-primary, sidebar-primary-foreground,
sidebar-accent, sidebar-accent-foreground,
sidebar-border, sidebar-ring
```

**Cores semânticas cross-app (`success`, `warning`)**: verde/âmbar independentes do chart-palette de cada app. Use em mensagens de status (`Compra confirmada!`, `Plano cancelado — ativo até X`, banners de "não consegui identificar uma receita") para que cozya/agenda/admin comuniquem sucesso/atenção do mesmo jeito mesmo tendo paletas de marca diferentes. Padrão de uso: `bg-success/10 border-success/40 text-success` (versão tinted, mais legível em alerts) ou `bg-success text-success-foreground` (solid, para badges com contraste alto). Mesma régua pro `warning`. Para erro continua sendo `destructive`.

**Tipografia, geometria e sombra:**

```
font-sans, font-serif, font-mono,
radius (+ radius-sm/md/lg/xl derivados),
shadow-2xs..shadow-2xl,
tracking-normal (+ tracking-tight..widest derivados),
spacing (base 0.25rem do Tailwind v4)
```

`@theme inline` mapeia `--color-*` → `var(--*)`, então classes utilitárias do Tailwind (`bg-primary`, `text-muted-foreground`, `border-border`, `ring-ring`) "apenas funcionam" e respondem a `.dark` automaticamente.

## Override por app

Cada `apps/<app>/src/app/globals.css`:

```css
@import "tailwindcss";
@import "@informach/ui/styles.css";
@source "../../../../packages/ui/src/**/*.{ts,tsx}";

:root {
  --font-sans: var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-ibm-plex-mono), "IBM Plex Mono", ui-monospace, monospace;
}
```

A regra de ouro: o app sobrescreve **só cores de destaque**. A escala de cinza pertence ao package e é compartilhada entre admin/agenda-da-turma/cozya.

**Pode sobrescrever** (cores que carregam identidade do app):

- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--ring`
- `--destructive`, `--destructive-foreground`
- `--chart-1` … `--chart-5`
- `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-ring`

**Não sobrescrever** (escala de cinza neutra — quebra a consistência visual entre apps):

- `--background`, `--foreground`
- `--card`, `--card-foreground`, `--popover`, `--popover-foreground`
- `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`
- `--border`, `--input`
- `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`

A linha `@source` faz o Tailwind escanear arquivos do package; sem ela, classes que aparecem só dentro do package são purgadas.

## Fontes

O package declara o stack em `--font-sans` / `--font-mono` / `--font-serif` apontando todos para Plus Jakarta Sans + fallbacks de sistema. O app carrega a fonte real via `next/font/google` no `layout.tsx` (`Plus_Jakarta_Sans` com `variable: "--font-jakarta"`); o `globals.css` do app prepende `var(--font-jakarta)` ao stack para que a fonte hospedada localmente tome precedência.

## Dark mode

`<ThemeProvider>` (`next-themes`) e `<ModeToggle>` são exportados pelo package. O app só envolve o `RootLayout`:

```tsx
import { ThemeProvider } from "@informach/ui/components/theme-provider";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

`attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange` já são defaults — não passe a menos que precise mudar.

`suppressHydrationWarning` no `<html>` é obrigatório: o `next-themes` injeta a classe `.dark` antes da hidratação.

## Utilities cross-cutting

Definidas em `styles.css` e disponíveis em qualquer app:

- `.scrollbar-subtle` — scrollbar fina que aparece só no hover.
- Overrides do `[data-sonner-toast]` — fundo/borda/texto via tokens (`--popover`, `--popover-foreground`, `--border`).
- Esconder reveal nativo do `input[type="password"]` (Edge/WebKit) para deixar o toggle custom como único controle visível.

Não há mais utilitários de marca (`.brand-*`, `.sz-*`, `.sz-btn-gradient`, `.sz-hot-badge`, `.sz-progress`, `.sz-divider`, `.brand-gradient-text`). Use primitivos shadcn (`<Separator />`, `<Badge />`, `<Progress />`) e classes Tailwind (`font-mono`, `text-4xl`, `tracking-tight`).

## Adicionar um novo componente shadcn

```bash
cd packages/ui
pnpm dlx shadcn@latest add <name>
```

A CLI lê `components.json`, cria `src/components/<name>.tsx` e adiciona automaticamente as Radix deps necessárias ao `package.json`.

Após gerar, **revise**:

- Tem cor literal (`zinc-`, `slate-`, `#hex`, `rgb(`, `oklch(`)? Trocar por token.
- O `import` de `cn` está apontando para `@informach/ui/lib/utils`? Sim por default.
- O componente é client-only? Garanta o `"use client"` se usa hook.

## Consumo nos apps

Cada componente é importado pelo subpath:

```tsx
import { Button } from "@informach/ui/components/button";
import { Dialog, DialogContent } from "@informach/ui/components/dialog";
import { ModeToggle } from "@informach/ui/components/mode-toggle";
```

`src/index.ts` só exporta `cn`. Subpaths `./components/*`, `./lib/utils` e `./styles.css` estão declarados em `exports`.

Os apps adicionam `@informach/ui` em `transpilePackages` no `next.config.ts` — necessário porque o package é consumido como TypeScript source.

## O que NÃO entra aqui

- Utilities específicas de feature (Tiptap/ProseMirror, chat-prose, mention pills) → moram no app que usa o feature.
- Componentes de domínio (ChannelList, AgendaCalendar) → moram no app.
- Server Actions → moram no app que as roteia.
- Cores literais em qualquer lugar — sempre token.

## Anti-patterns

- `bg-[#fff]`, `text-[oklch(...)]`, `border-zinc-300` em componentes.
- Criar um token novo dentro de um componente.
- Sobrescrever a escala de cinza (`--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--accent`, `--border`, `--input`, `--sidebar` neutros) num app — quebra a consistência cross-app.
- Usar `var(--color-primary)` direto — prefira a classe utilitária `bg-primary` (ela já mapeia via `@theme inline`).
- Importar de `@informach/ui` raiz — sempre via subpath.

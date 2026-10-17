# `@informach/emails` — Templates de email

Os templates HTML enviados pelo package são **componentes React Email** renderizados server-side via `@react-email/render`. Toda mudança em `src/templates/*.tsx` é uma mudança visível ao usuário final — o checklist abaixo é mandatório antes de promover para produção.

> Para deploy do pipeline completo de email (DKIM/SPF/DMARC, Signed Webhook, cron jobs, smoke test E2E), ver [`PRODUCTION.md`](./PRODUCTION.md). Esta doc cobre apenas templates.

## Templates atuais

| Componente | Categoria | Quando dispara |
|---|---|---|
| `VerificationEmail` | `auth.verify-email` | Sign-up — confirmação de email |
| `PasswordResetEmail` | `auth.password-reset` | Forgot password |
| `MagicLinkEmail` | `auth.magic-link` | Sign-in passwordless |
| `InvitationEmail` | `auth.invitation` | Convite a uma organization (organizations enabled) |
| `AccountDeletionEmail` | `auth.account-deletion` | Confirmação de exclusão de conta (LGPD) |
| `AdminAlertEmail` | `admin.alert` | Bastidores: serviço fora do ar em duas verificações seguidas, e de volta |
| `AdminWeeklySummaryEmail` | `admin.weekly-summary` | Bastidores: resumo da semana para as contas owner, segunda de manhã |

Todos compartilham `<EmailLayout appName preheader title body cta unsubscribeUrl unsubscribeMailto />`.

## API pública

```ts
import { renderTemplate } from "@informach/emails";

const { html, text, subject } = await renderTemplate("auth.verify-email", {
  appName: "Agenda da Turma",
  url: "https://app.example.com/verify?token=...",
  unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=...",
  unsubscribeMailto: "unsubscribe@app.example.com",
  locale: "pt-BR",   // opcional, default "pt-BR"
});
```

`render(...)` produz HTML inline-CSS otimizado e text plano com paridade automática (não há mais duplicação manual HTML/text como na versão pré-React Email).

## Preview server

```bash
pnpm --filter @informach/emails preview
# Abre em http://localhost:4080 com hot reload de todos os templates
```

Use o preview server para iteração rápida em desenvolvimento. Cada `.tsx` em `src/templates/` aparece como uma página com props padrão (`PreviewProps`).

## Snapshot tests

`src/__tests__/templates.test.tsx` usa `toMatchInlineSnapshot()` para HTML e text de cada template. Qualquer mudança visual quebra o snapshot — esse é o ponto. Atualizar via `pnpm --filter @informach/emails test -u` **só depois** de validar o checklist abaixo.

## Pre-flight checklist (manual, antes de promover)

Para cada template alterado:

- [ ] **Inline CSS only** — `@react-email/components` faz isso por padrão. Se adicionar `<Tailwind>`, conferir que classes utilitárias são inlinadas no output.
- [ ] **Mobile (320px de largura)** — botão CTA com altura mínima 44px (touch target). `<Button>` do `@react-email/components` já cumpre.
- [ ] **Outlook desktop (Word renderer)** — sem flexbox/grid. `<Container>` do React Email usa `<table>` por baixo.
- [ ] **Gmail clipping** — output total < 102KB. Templates atuais são pequenos — folga grande.
- [ ] **Modo escuro** — cores hardcoded com fallback `color-scheme: light dark`. CTA `background:#111827; color:#ffffff` sobrevive bem.
- [ ] **Preheader oculto** — primeira string visível em listagem. `<EmailLayout preheader="...">` faz isso.
- [ ] **Alt text e label de CTA** em PT-BR, claro, com verbo na imperativa.
- [ ] **Footer com unsubscribe** quando `unsubscribeUrl` fornecido (já feito pelo `EmailLayout`).
- [ ] **Escaping** — JSX escapa por padrão. Não usar `dangerouslySetInnerHTML` em templates.

## Validação manual em clientes reais

Antes de promover qualquer alteração para produção:

1. **Local (sandbox mode):** `EMAIL_SANDBOX_MODE=sandbox pnpm dev:agenda-da-turma` — emails caem em `tmp/integration_emails/<id>.html`. Abrir no browser para inspeção rápida.

2. **Preview server:** `pnpm --filter @informach/emails preview` para iterar com hot reload.

3. **Litmus / Email on Acid:** se a equipe tiver licença, subir o HTML para preview cross-client. Cobre Gmail, Outlook (várias versões), Apple Mail, modo escuro.

4. **Sem licença:** enviar para 4 contas de teste pessoais (Gmail web + Android, Outlook.com web, Apple Mail iOS, Yahoo). mail-tester.com também ajuda — pontua spam-likeliness.

5. **Dark mode:** checar pelo menos Gmail Android (auto dark) e Apple Mail iOS (configurações do device).

## Quando você precisa atualizar snapshots

```bash
# 1. Roda checklist manual primeiro
# 2. Atualiza snapshots
pnpm --filter @informach/emails test -u
# 3. Diff mostra exatamente o que mudou — incluir no PR
git diff packages/emails/src/__tests__/__snapshots__/
```

## Adicionando um template novo

1. Criar componente `src/templates/<name>.tsx` reutilizando `<EmailLayout>`. Definir `<Name>.PreviewProps` para o preview server.
2. Adicionar strings em `messages/pt-BR.json` no namespace correspondente.
3. Adicionar nova `EmailCategory` em `src/dispatch.ts` (union type) e em `EMAIL_CATEGORIES` (array) em `src/schemas.ts`.
4. Adicionar mapeamento em `src/templates/index.ts` no `renderTemplate`.
5. Snapshot test em `src/__tests__/templates.test.tsx`.
6. Wire-up no caller (em geral `@informach/auth`) que dispara o email.
7. Validar manualmente conforme checklist.
8. Atualizar a tabela de "Templates atuais" deste arquivo + `CLAUDE.md` §3.3.

## Internacionalização

Infraestrutura via `next-intl/createTranslator` (server-side, sem provider React). Default `locale: "pt-BR"`. Adicionar locale novo:

1. `messages/<locale>.json` com mesmas chaves de `pt-BR.json`.
2. Adicionar em `SUPPORTED_LOCALES` em `src/templates/i18n.ts`.
3. Snapshot test pareado para o novo locale.

Sem outro locale ativo no momento — apenas a infra está pronta.

## Limitações conhecidas

- **Sem logo/imagem** nos templates atuais. Se adicionar `<Img>`: hospedar em CDN próprio (não data URIs — Outlook bloqueia), garantir HTTPS, alt text, fallback `style="display:none"` para clientes que bloqueiam.

- **Branding atual é genérico** (`appName` only). Para apps com branding diferente, considerar passar overrides via prop ou criar layout alternativo.

- **`open` / `click` tracking desabilitados** no painel SendGrid (decisão de privacidade). `<Link>` do React Email não tenta rastrear.

# `@informach/auth` — Email templates

Os templates HTML enviados pelo package são **minimalistas e inline-css only** para sobreviver ao maior número possível de clientes de email. Toda mudança em `src/templates.ts` é uma mudança visível ao usuário final — o checklist abaixo é mandatório antes de promover para produção.

## Templates atuais

| Função | Categoria | Quando dispara |
|---|---|---|
| `verificationEmailHtml/Text` | `auth.verify-email` | Sign-up — confirmação de email |
| `passwordResetEmailHtml/Text` | `auth.password-reset` | Forgot password |
| `magicLinkEmailHtml/Text` | `auth.magic-link` | Sign-in passwordless |
| `invitationEmailHtml/Text` | `auth.invitation` | Convite a uma organization (organizations enabled) |
| `accountDeletionEmailHtml/Text` | `auth.account-deletion` | Confirmação de exclusão de conta (LGPD) |

Todos compartilham `EmailLayout({ appName, preheader, title, body, cta, unsubscribeUrl, unsubscribeMailto })`.

## Snapshot tests

`src/__tests__/templates.test.ts` tem `toMatchSnapshot()` para cada template HTML. Qualquer mudança visual quebra o snapshot — esse é o ponto. Atualizar via `pnpm --filter @informach/auth test -u` **só depois** de validar o checklist abaixo.

## Pre-flight checklist (manual, antes de promover)

Para cada template alterado:

- [ ] **Inline CSS only**. Não usar `<style>` interno (Gmail strip). Não usar variáveis CSS (`var(--x)`) — Outlook ignora.
- [ ] **Mobile (320px de largura)**. Botão CTA com altura mínima 44px (touch target).
- [ ] **Outlook desktop (Word renderer)**. Sem flexbox, sem grid. `max-width:520px` em `<div>` é OK.
- [ ] **Gmail clipping**. Output total < 102KB. Templates atuais ~3KB cada — folga grande.
- [ ] **Modo escuro**. Cores hardcoded (`#111827`, `#6b7280`) com fallback de `color-scheme: light dark` quando aplicável. Para CTA: `background:#111827; color:#ffffff` sobrevive bem.
- [ ] **Preheader oculto** (já feito via `EmailLayout`) — primeira string visível em listagem.
- [ ] **Alt text e label de CTA** em PT-BR, claro, com verbo na imperativa.
- [ ] **Footer com unsubscribe** quando `unsubscribeUrl` fornecido (já feito).
- [ ] **`escapeHtml` em qualquer interpolação dinâmica** (já consistente).

## Validação manual em clientes reais

Antes de promover qualquer alteração para produção:

1. **Local (sandbox mode):** `EMAIL_SANDBOX_MODE=sandbox pnpm dev` — emails caem em `tmp/integration_emails/<id>.html`. Abrir no browser para inspeção rápida.
2. **Litmus / Email on Acid:** se a equipe tiver licença, subir o HTML para preview cross-client. Cobre Gmail, Outlook (várias versões), Apple Mail, modo escuro.
3. **Sem licença:** enviar para 4 contas de teste pessoais (Gmail web + Android, Outlook.com web, Apple Mail iOS, Yahoo). mail-tester.com também ajuda — pontua spam-likeliness.
4. **Dark mode:** checar pelo menos Gmail Android (auto dark) e Apple Mail iOS (configurações do device).

## Quando você precisa atualizar snapshots

```bash
# 1. Roda checklist manual primeiro
# 2. Atualiza snapshots
pnpm --filter @informach/auth test -u
# 3. Diff mostra exatamente o que mudou — incluir no PR
git diff packages/auth/src/__tests__/__snapshots__/templates.test.ts.snap
```

## Adicionando um template novo

1. Adicionar função `*EmailHtml/Text` em `src/templates.ts` reutilizando `EmailLayout`.
2. Se categoria nova: adicionar em `EmailCategory` (`packages/emails/src/dispatch.ts`).
3. Wire-up em `src/index.ts` (callback do plugin/feature que dispara o email).
4. Test de unidade cobrindo conteúdo (`expect(html).toContain(...)`) + snapshot test.
5. Validar manualmente conforme checklist.
6. Atualizar a tabela de "Templates atuais" deste arquivo.

## Limitações conhecidas

- Templates atuais não têm logo ou imagem. Se adicionar `<img>`: hospedar em CDN próprio (não data URIs — Outlook bloqueia), garantir HTTPS, alt text, fallback `style="display:none"` para clientes que bloqueiam.
- Sem suporte a internacionalização. Tudo em PT-BR. Adicionar i18n requer parametrizar strings.
- `EmailLayout` não cobre dark mode customizado. Para apps que precisarem branding diferente, considerar passar `EmailLayout` overrides via prop ou criar layout alternativo.

# `@informach/auth` — Email templates

> **Movido.** Templates passaram a viver no package `@informach/emails` como componentes React Email. Documentação atualizada em [`@informach/emails/EMAILS.md`](../emails/EMAILS.md).

O package `@informach/auth` continua sendo o caller dos templates (verify-email, password-reset, magic-link, invitation, account-deletion), mas a renderização e a snapshot policy ficam no package emails.

Para checklist visual cross-client, preview server, snapshot workflow e regras para adicionar template novo: ver `packages/emails/EMAILS.md`.

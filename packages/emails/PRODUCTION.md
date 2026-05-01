# `@informach/emails` — checklist de produção

Tudo o que o operador precisa fazer para subir o pipeline de email com segurança em produção. Auth-related production (Railway services, CSP, Redis, etc.) está em `@informach/auth/PRODUCTION.md`. Esta lista é específica do pipeline de email.

---

## 1. SendGrid Domain Authentication (DKIM/SPF/DMARC)

**Sem isso, Gmail e Outlook mandam todos os emails para spam — inclusive os transacionais.** Akita Chronicles padrão #10. Configurar no painel SendGrid antes do primeiro envio em produção.

### Passos no painel SendGrid

1. **Settings → Sender Authentication → Authenticate Your Domain**.
2. DNS provider: escolha o seu (Cloudflare, Route 53, etc.) — só serve para sugerir nomes; o que importa são os 3 CNAME emitidos.
3. Domain you send from: **`informach.com.br`**.
4. Advanced Settings:
   - **Use a custom return path:** ON. Subdomínio sugerido: `mail` → return-path `mail.informach.com.br`.
   - **Use automated security:** ON (rotaciona DKIM key a cada 6 meses).
5. Branding: opcional. Se ON, adiciona um 4º CNAME para `link.informach.com.br` (CTAs passam pelo SendGrid).

### Registros DNS a criar

SendGrid emite 3 CNAMEs (4 se branding ON). Exemplo (substituir `s1`/`s2` e o ID pelos valores reais do painel):

```
em####.informach.com.br      CNAME    u####.wl###.sendgrid.net
s1._domainkey.informach.com.br   CNAME    s1.domainkey.u####.wl###.sendgrid.net
s2._domainkey.informach.com.br   CNAME    s2.domainkey.u####.wl###.sendgrid.net
```

TTL: 3600 (1h). Não usar Cloudflare proxy (laranja) — CNAMEs precisam ser DNS-only.

### Registros DNS adicionais (não emitidos pelo SendGrid)

**SPF** (1 registro TXT no apex):
```
informach.com.br   TXT   "v=spf1 include:sendgrid.net ~all"
```
Se já existe outro `v=spf1`, **mesclar** (`include:sendgrid.net include:_spf.google.com ~all`) — múltiplos `v=spf1` quebram SPF.

**DMARC** (1 registro TXT em `_dmarc`):
```
_dmarc.informach.com.br   TXT   "v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@informach.com.br; pct=100; adkim=s; aspf=s"
```
- `p=quarantine`: emails reprovados vão para spam (não bounce). Após 30 dias estabilizado, pode subir para `p=reject`.
- `rua`: endereço que recebe relatórios agregados (criar caixa antes ou usar serviço como dmarcian).
- `adkim=s`/`aspf=s`: alinhamento estrito. Reduz risco de spoofing.

### Validação

- **No SendGrid:** Settings → Sender Authentication → clique no domínio → **Validate**. Os 3 CNAMEs devem ficar verdes. Se algum vermelho: TTL ainda propagando ou Cloudflare proxy ON.
- **Externamente:** `dig CNAME em####.informach.com.br` (verificar resolução). [mxtoolbox.com/dmarc.aspx](https://mxtoolbox.com/dmarc.aspx) para validar DMARC. [mail-tester.com](https://www.mail-tester.com) — manda um email para o address gerado, recebe pontuação 0–10. Mira: **9.5+** antes de produção.

### Single Sender — desativar

**Settings → Sender Authentication → Single Sender Verification → REMOVE all entries.** Single Sender ignora DKIM e cai em spam. Após Domain Authentication validada, todos os `from:` em `@informach.com.br` ficam autenticados automaticamente — não precisa de Single Sender.

---

## 2. Signed Event Webhook

Validação criptográfica de payload do SendGrid. Sem isso, qualquer um pode forjar `delivered`/`bounce` no nosso DB. **Obrigatório** em produção.

### Passos no painel SendGrid

1. **Settings → Mail Settings → Event Webhook → Edit**.
2. **HTTP Post URL:** `https://<dominio-custom>/api/webhooks/sendgrid` (um por app).
3. **Authorization Method:** None — usamos signed payload (próximo passo) em vez de auth header.
4. **Actions to be Posted:**
   - Habilitar: `processed`, `delivered`, `deferred`, `bounce`, `dropped`, `spamreport`, `unsubscribe`, `group_unsubscribe`.
   - **NÃO habilitar** `open`, `click`. Decisão de privacidade — não rastreamos.
5. **Test Your Integration:** clica e confere se chega no `/api/webhooks/sendgrid` (Railway logs).
6. **Signed Event Webhook:** toggle ON.
7. Copia a **Verification Key** que aparece (`-----BEGIN PUBLIC KEY-----...`).

### Configurar no app

```
SENDGRID_WEBHOOK_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\nMFkw...\n-----END PUBLIC KEY-----
```

(Newlines literais via `\n` no env var. Usar Variables → Edit no Railway.)

A rota já está implementada: `apps/<app>/src/app/api/webhooks/sendgrid/route.ts`. Verifica assinatura ECDSA com `verifySendgridSignature` antes de processar. Sem `SENDGRID_WEBHOOK_PUBLIC_KEY`, devolve `503` (operacionalmente: webhook desativado).

### Validação

1. SendGrid → Event Webhook → **Test Your Integration** → confere `200 OK` no log do Railway.
2. Disparar um signup real → ver evento `processed` chegar no DB:
   ```sql
   SELECT id, status, provider_message_id, updated_at
   FROM core.email_deliveries
   WHERE recipient = 'seu-email@gmail.com'
   ORDER BY created_at DESC LIMIT 1;
   ```
   Após delivery, `provider_accepted` = true.

---

## 3. Cron jobs (3 sweepers)

Pattern Railway documentado em `@informach/auth/PRODUCTION.md` §7. Resumo dos jobs deste package:

| Job | Cron | Endpoint | Sweeper |
|---|---|---|---|
| `email-retry` | `*/5 * * * *` | `/api/jobs/email-retry` | `retryFailedDeliveries` |
| `email-recover-stale` | `*/30 * * * *` | `/api/jobs/email-recover-stale` | `recoverStaleDeliveries` |
| `email-suppression-sync` | `0 5 * * *` | `/api/jobs/email-suppression-sync` | `syncSendgridSuppressions` |

Todos os 3 endpoints já existem em `apps/agenda-da-turma/src/app/api/jobs/` e `apps/cozya/src/app/api/jobs/`. Cada um:
- Aceita `POST` apenas.
- Valida `Authorization: Bearer ${CRON_SECRET}`.
- Chama o sweeper com deps já populados via `env`.
- Retorna `Response.json(result)` com contagens.

Start command no Railway `cron-runner-*` (1 service por job, por app):
```sh
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://${APP_URL}/api/jobs/email-retry"
```

Configurar **Service → Settings → Cron Schedule** com a expressão da tabela (UTC).

### Por que 3 jobs separados?

- **Idempotência por destinatário** (Akita pattern #1): cada falha tem retry policy próprio. `email-retry` re-tenta apenas `failed` no backoff window.
- **Stale recovery** (#5): `recoverStaleDeliveries` cuida de rows presas em `sending` (worker crashed depois de chamar SendGrid mas antes de marcar `sent`). Move para `unknown` — **nunca reenvia** (SendGrid pode ter aceito).
- **Suppression sync** (#11): SendGrid silenciosamente recusa emails na suppression list — sem reportar erro. Pull diário do `/v3/suppression/*` mantém nosso `email_suppressions` espelhado.

---

## 4. Env vars por app

Mínimo para o pipeline de email funcionar:

| Var | Onde se obtém | Notas |
|---|---|---|
| `SENDGRID_API_KEY` | SendGrid → Settings → API Keys → Create | **Permissão "Restricted Access"** com `Mail Send: Full`, `Suppressions: Read+Write`, `Mail Settings: Read`. Não usar `Full Access`. |
| `SENDGRID_FROM` | Você define | Endereço pertencente ao domínio autenticado (§1). Ex.: `noreply@informach.com.br`. |
| `SENDGRID_WEBHOOK_PUBLIC_KEY` | SendGrid → Mail Settings → Event Webhook → Signed Event Webhook (§2) | Sem ela, webhook desabilitado (503). Apps **podem subir sem isso** — webhook só não funciona até configurar. |
| `EMAIL_SANDBOX_MODE` | Manual | `"live"` em prod. `"sandbox"` em dev/integration. `"memory"` em E2E (Playwright). |
| `EMAIL_SANDBOX_DIR` | Manual (opcional) | Default `./tmp/integration_emails`. Só usado em sandbox mode. |
| `CRON_SECRET` | `openssl rand -base64 32` | Compartilhado entre o app e o `cron-runner` correspondente. |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | Reusado na geração de tokens HMAC para unsubscribe. |
| `NEXT_PUBLIC_APP_URL` | Manual | Compõe URL absoluta do unsubscribe. **HTTPS obrigatório** em prod. |

### Onde configurar no Railway

**Per service** (não shared) — cada app tem sua própria API key e public key:
- Service `agenda-da-turma` → Variables → Add `SENDGRID_API_KEY`, `SENDGRID_FROM=noreply-agenda@informach.com.br`, etc.
- Service `cozya` → Variables → idem (key/from podem ou não ser distintos).

Use **Variable References** sempre que possível: `BETTER_AUTH_SECRET=${{Postgres.DATABASE_URL_PASSWORD}}` etc não — secrets de auth são manuais e únicos por env.

---

## 5. Smoke test E2E (pós-deploy)

Após primeiro deploy, validar de cabo a rabo:

```bash
# 1. Trigger sign-up real (vai bater /api/auth/sign-up/email).
curl -X POST https://agenda.informach.com.br/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"voce+test@gmail.com","password":"<senha-forte>","name":"Test"}'

# 2. Aguarda ~30s, confere chegou na inbox (não no spam!).
#    Inspeciona o email-source: deve ter "DKIM-Signature" + "spf=pass" + "dmarc=pass".

# 3. No DB:
#    SELECT id, status, provider_message_id, send_attempts FROM core.email_deliveries
#    WHERE recipient = 'voce+test@gmail.com' ORDER BY created_at DESC LIMIT 1;
#    Esperado: status='sent' (após sgMail.send) → 'delivered' (após webhook).

# 4. Clicar no link de verify-email → confere `status='delivered'` no DB.

# 5. Clicar no link de unsubscribe do footer → página confirma.
#    SELECT * FROM core.email_unsubscribes WHERE category = 'auth.verify-email';
#    Esperado: row inserida.

# 6. Forçar bounce: cadastrar email inexistente (ex.: voce+nope@invalid-domain-xyz.com).
#    SendGrid bate webhook com event=bounce → status='bounced' + email vai para core.email_suppressions.

# 7. Disparar manualmente cada cron (com Bearer):
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://agenda.informach.com.br/api/jobs/email-recover-stale
# Esperado: { "recovered": 0 }
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://agenda.informach.com.br/api/jobs/email-suppression-sync
# Esperado: { "synced": N, "byType": {...} }
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://agenda.informach.com.br/api/jobs/email-retry
# Esperado: { "retried": 0, "recovered": 0, "failed": 0, "skipped": 0 } se nada está failed.
```

---

## 6. Monitoramento contínuo

Alertas mínimos via SendGrid e DB:

### No painel SendGrid (Stats → Overview)
- **Bounce rate:** alvo < 5%. Acima de 10% = problema sério (lista suja, validação de email no signup falha, etc.).
- **Spam complaints:** alvo < 0.1%. Acima de 0.3% = SendGrid pode suspender a conta.
- **Reputation score:** alvo > 90.

### No DB (queries de health)
```sql
-- Taxa de delivery nos últimos 7 dias
SELECT category, status, COUNT(*) FROM core.email_deliveries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY category, status ORDER BY category, status;

-- Top razões de falha
SELECT last_error, COUNT(*) FROM core.email_deliveries
WHERE status = 'failed' AND updated_at > NOW() - INTERVAL '24 hours'
GROUP BY last_error ORDER BY 2 DESC LIMIT 20;

-- Suppressions recentes
SELECT reason, COUNT(*) FROM core.email_suppressions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY reason;
```

### Sentry (quando ativo)
Plugar logger do `createEmailService(config)` para emitir `error` events:
```ts
createEmailService({
  // ...
  logger: {
    error: (msg, ctx) => Sentry.captureMessage(msg, { level: "error", extra: ctx }),
    warn: (msg, ctx) => Sentry.captureMessage(msg, { level: "warning", extra: ctx }),
  },
});
```

---

## 7. Validação visual de templates

Templates são componentes React Email — qualquer mudança visual quebra snapshot. Antes de promover para produção:

1. Rodar `pnpm --filter @informach/emails test` (snapshots devem passar — ou ser intencionalmente atualizados via `-u`).
2. Rodar `pnpm --filter @informach/emails preview` → http://localhost:4080 → inspecionar todos os 5 templates.
3. Validar cross-client com checklist em `packages/emails/EMAILS.md` (Gmail web/Android, Apple Mail iOS, Outlook desktop, dark mode).

Tipo de mudança × esforço:
- **Texto** (string em `messages/<locale>.json`): snapshot quebra mas visual OK; só revisar a string.
- **CSS** (`paragraphStyle`, `containerStyle`): cross-client manual obrigatório (quebra fácil em Outlook).
- **Componente novo** (`<Img>`, `<Hr>`): preview server + cross-client + atualizar `EMAILS.md`.

---

## 8. Rollback

### Templates revertidos
`git revert <commit>` + `pnpm db:migrate` (se houve migration). Snapshots viajam com o código — não há state extra.

### Pipeline de envio quebrado
Se `dispatchEmail` está falhando todas as tentativas (ex.: API key revogada, domain auth removida acidentalmente):
1. Setar `EMAIL_SANDBOX_MODE=sandbox` em produção temporariamente — emails caem em disco, fluxos de signup não quebram.
2. Investigar.
3. Após corrigir, voltar para `live`. Os 3 sweepers vão pegar o backlog automaticamente em ~5 min (`email-retry`).

### Webhook quebrado
Setar `SENDGRID_WEBHOOK_PUBLIC_KEY=` (vazio) → endpoint devolve 503 → SendGrid retenta 5x e desiste. **Status no DB fica em `sent`** (não progride para `delivered`/`bounced`), mas não há perda de email — só métricas pós-delivery não aparecem. Reabilitar quando consertado.

---

## 9. Limites e custos

- **SendGrid Free tier:** 100 emails/dia. Para produção: **Essentials 40k/$19.95/mês** ou **Pro 100k/$89.90/mês**.
- **Rate limit do SendGrid:** 600 req/s por API key. Não atingimos hoje (envio síncrono no sign-up + retry em batch de 50).
- **Reputation:** isolada por domínio autenticado, não por API key. Compartilhar `mail.informach.com.br` entre `agenda-da-turma` e `cozya` é OK (mesma "reputação").

Custos não-SendGrid:
- Railway: 1 service Next.js + 1 cron-runner por job (`alpine/curl`, custo ~$0/mês cada).
- Postgres: tabelas de email são pequenas (índices em `category+messageKey`, `status+nextAttemptAt`).

---

## 10. Lista pré-deploy

Checklist final antes do primeiro envio de produção:

- [ ] Domain Authentication validada no SendGrid (3 CNAMEs verdes).
- [ ] SPF + DMARC configurados no DNS apex.
- [ ] mail-tester.com pontua **9.5+** com email transacional real.
- [ ] Single Sender removido do SendGrid.
- [ ] `SENDGRID_*` env vars setadas em ambos apps no Railway.
- [ ] Signed Event Webhook ativado, public key copiada para `SENDGRID_WEBHOOK_PUBLIC_KEY`.
- [ ] 3 cron-runners por app criados, cada um com sua Cron Schedule.
- [ ] `pnpm db:migrate` aplicado (incluindo `0007_chief_blob.sql` que adiciona `html`/`text` em `email_deliveries`).
- [ ] Smoke test E2E §5 passou completamente.
- [ ] Sentry (opcional) plugado no logger do `createEmailService`.
- [ ] DMARC reports (`rua`) chegando em caixa monitorada.

---

## Referências cruzadas

- **Auth deploy** (Railway services, CSP, Redis, cron pattern genérico): `@informach/auth/PRODUCTION.md`.
- **Validação visual de templates:** `@informach/emails/EMAILS.md`.
- **Arquitetura interna do package:** `@informach/emails/CLAUDE.md`.
- **Lista de pendências do operador atualizada:** `next-steps.txt` na raiz do monorepo.
- **Padrões de produção (Akita Chronicles, "Enviando emails sem spammar"):** `vibe-coding-vault/90-Fontes/Akita-Chronicles/artigos/2026-02-17-enviando-emails-sem-spammar*.md` no segundo cérebro do usuário.

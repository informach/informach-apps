# Bastidores (`apps/admin`)

Console da equipe Informach em `admin.informach.com.br` (porta 3003 em desenvolvimento). Acompanha os quatro produtos com conta (Cozya, Agenda da Turma, Missão Saber e Suíte Edi), o site institucional e todas as contas, num lugar só, com rastro de cada consulta. Proposta aprovada pela titular em 17/10/2026 (canvas "Bastidores"). Deploy e primeira entrada em [`PRODUCAO.md`](./PRODUCAO.md).

## Regras que valem em todas as telas

1. **Ver sem espiar.** Conta, plano, uso em números e saúde. Receitas, recados, atividades, respostas das crianças, prompts e o texto dos e-mails nunca aparecem. De criança, só a contagem de perfis. O teste `src/features/privacy.test.ts` falha se um repositório ler coluna proibida.
2. **Toda consulta deixa rastro.** Abrir a ficha grava `admin.user_viewed`; toda ação grava o evento em nome de quem agiu, com motivo quando muda algo. Payloads em `docs/audit-payload-policy.md`.
3. **Consequência antes do clique.** Cada botão diz o que acontece e pede confirmação com o efeito escrito.
4. **Nunca entrar como a pessoa.** Sem impersonação.
5. **Cada coisa tem um dono.** Preço, reembolso e cancelamento ficam no Stripe; conteúdo de olimpíada, na manutenção da Missão Saber. O Bastidores mostra e leva até lá (`src/lib/links.ts`).
6. **Entrada fechada.** Só papel owner ou admin, sempre com duas etapas. Os demais veem só "Esta conta não tem acesso ao Bastidores." e a sessão é encerrada.

Copy em português, humanizada, sem travessão, "pessoas" e não "usuários", nome do produto e não o slug, número sempre com unidade e período, situação sempre com ícone e palavra.

## Papéis

| Ação | owner | admin |
|---|---|---|
| Painel, Pessoas, Produtos, Operação, Auditoria | Sim | Sim |
| Encerrar sessões, reenviar confirmação, banir e desbanir, desconectar computador Edi | Sim | Sim |
| Dinheiro e qualquer valor de receita | Sim | Não |
| Mudar papel (`users.set_role`) | Sim | Não |
| Exportar a auditoria | Sim | Não |

Ninguém bane conta owner ou admin pela tela, nem muda o próprio papel.

**Ninguém se torna equipe sozinho.** Toda conta nasce `member` em qualquer produto, o campo `role` não aceita valor vindo do cliente (`input: false` em `@informach/auth`) e o cadastro do Bastidores é desligado. O primeiro owner é criado uma única vez pelo script `pnpm --filter @informach/admin bootstrap-owner <email>`, que se recusa a rodar quando já existe owner (salvo `--emergencia`, para quando nenhum owner consegue entrar). Daí em diante, só um owner dá ou tira papel, na ficha da pessoa, com duas etapas e registro na auditoria em nome de quem mudou. O script não cria conta nem senha.

## Entrada

- Senha e depois o código do aplicativo autenticador (plugin `twoFactor` do Better Auth). O plugin só intercepta `/sign-in/email`, e o Better Auth tem outras rotas que criam sessão (confirmar e-mail por código com entrada automática, entrar por código no e-mail, link mágico). Por isso a rota `/api/auth/[...all]` só atende a lista fechada de `src/lib/auth-routes.ts` (senha, código, ativação, troca de senha, sair; o resto é 404, com teste), link mágico e entrada por código não carregam, e confirmar e-mail não cria sessão (`email.autoSignInAfterVerification: false`). Rota nova do Better Auth só entra na lista se não criar sessão sem a segunda etapa.
- "Criar ou trocar a senha" usa código no e-mail (`email.forgetPassword: "otp"`), porque as contas da casa entram nos produtos por código e podem não ter senha. `sendStaffOnlyEmail` só entrega e-mail de autenticação a contas owner ou admin; para os demais responde como se tivesse enviado.
- Sem duas etapas ativas, toda tela leva a `/duas-etapas` (QR, códigos de recuperação, primeiro código).
- Sessão de 12 horas, sem renovação e sem cache em cookie. Papel, banimento e duas etapas são lidos de `core.users` a cada pedido (`src/lib/access.ts`), então retirar o papel vale no próximo clique.
- `BETTER_AUTH_SECRET` é próprio do Bastidores: é ele que impede um cookie de outro produto de valer aqui.

## Arquitetura

- `src/proxy.ts`: exige sessão em tudo, menos entrada, auth, saúde, rotinas e descadastro; aplica CSP com nonce, em modo de bloqueio desde o início.
- `src/app/(painel)/layout.tsx`: `requireStaff()` e o menu. Telas em `src/app/(painel)/*`.
- `src/features/<área>/`: `repository.ts` (consultas), `service.ts` (composição sem banco nem Next), `actions.ts` (server actions com `staffAction`), `components/`. O Biome proíbe páginas e rotas de importar o banco.
- Leitura pela conexão só de leitura (`readDb()`, `default_transaction_read_only`; `READONLY_DATABASE_URL` quando houver usuário próprio). Escrita só pelas funções dos pacotes (`setUserBanState`, `setUserRole`, `revokeDevice`, `logAuditEvent`) e no schema `ops`.
- Sessões de Cozya, Agenda e Missão vivem no Redis de cada app (`cozya:auth:`, `agenda-da-turma:auth:`, `missao-saber:auth:`). Encerrar sessões apaga `core.sessions` e chama `revokeCachedSessions` em cada prefixo (`src/lib/redis.ts`). No Cozya e na Agenda, o cache em cookie ainda segura a sessão por até 5 minutos; a tela diz isso.
- Serviços conferidos em `src/lib/services.ts`: `/api/ready` diz se está pronto e `/api/health` diz a versão; o site responde pela página inicial. Resultado reaproveitado por 1 minuto. O "desde quando" vem de `ops.service_status`, mantido pela vigia.
- Cada rotina `/api/jobs/*` dos apps grava a execução em `ops.job_runs` por `recordJobRun`, só com números e booleanos do resultado.

## Desenvolvimento

```bash
pnpm dev:admin                    # http://localhost:3003
pnpm --filter @informach/admin test
pnpm --filter @informach/admin exec tsc --noEmit
```

Variáveis em `.env.example`. Em desenvolvimento, `ADMIN_SERVICE_URLS` aponta o painel para os apps locais. Nunca rode o Bastidores contra o banco de produção a partir da máquina local.

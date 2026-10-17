# Bastidores (`apps/admin`)

Console da equipe Informach em `admin.informach.com.br` (porta 3003 em desenvolvimento). Acompanha os quatro produtos com conta (Cozya, Agenda da Turma, Missão Saber e Suíte Edi), o site institucional e todas as contas, num lugar só, com rastro de cada consulta. Proposta aprovada pela titular em 17/10/2026 (canvas "Bastidores"). Deploy e primeira entrada em [`PRODUCAO.md`](./PRODUCAO.md).

## Regras que valem em todas as telas

1. **Ver sem espiar.** Conta, plano, uso em números e saúde. Receitas, recados, atividades, respostas das crianças, prompts e o texto dos e-mails nunca aparecem. De criança, só a contagem de perfis. O teste `src/features/privacy.test.ts` falha se um repositório ler coluna proibida.
2. **Toda consulta deixa rastro.** Abrir a ficha grava `admin.user_viewed`; toda ação grava o evento em nome de quem agiu, com motivo sempre que muda algo (encerrar sessões, banir, desbanir, mudar papel, desconectar computador). Payloads em `docs/audit-payload-policy.md`. A gravação é estrita (`logAuditEventStrict`), ao contrário dos outros apps: se o registro não gravar, a ficha e a exportação não aparecem e a tela pede para tentar de novo; banir, desbanir e mudar papel gravam o evento na mesma transação da mudança, então sem registro nada muda; encerrar sessões, reenviar confirmação e desconectar computador mudam coisas fora do nosso banco, e aí a tela diz o que já foi feito, avisa que o registro faltou e a falha vai para o Sentry (`audit.change_unrecorded`).
3. **Consequência antes do clique.** Cada botão diz o que acontece e pede confirmação com o efeito escrito.
4. **Nunca entrar como a pessoa.** Sem impersonação.
5. **Cada coisa tem um dono.** Preço, reembolso e cancelamento ficam no Stripe; conteúdo de olimpíada, na manutenção da Missão Saber. O Bastidores mostra e leva até lá (`src/lib/links.ts`).
6. **Entrada fechada.** Só papel owner ou admin, sempre com duas etapas. Os demais veem só "Esta conta não tem acesso ao Bastidores." e a sessão é encerrada no servidor.
7. **Nada grava por um link de fora.** O cookie é `SameSite=Lax`, então um link de outro site chega com sessão. A exportação da auditoria só atende `Sec-Fetch-Site: same-origin` (o botão da própria tela); o resto volta para a Auditoria com a explicação. A ficha aberta por navegação `cross-site`, `same-site` ou sem o cabeçalho mostra só a pergunta "Abrir esta ficha?", e o clique no botão, já de dentro, abre e grava. `none` (endereço digitado) e `same-origin` abrem direto (`src/lib/fetch-site.ts`). O `next` da entrada passaria por essas travas, porque a navegação depois da senha e do código sai da própria tela de entrada: por isso `safeNext` (`src/lib/safe-next.ts`) nunca devolve rota de API (um link para `/api/auditoria/export` volta para a tela da Auditoria) e marca a ficha com `?confirmar=1`, que a página trata como navegação de fora e responde com a mesma pergunta.

Copy em português, humanizada, sem travessão, "pessoas" e não "usuários", nome do produto e não o slug, número sempre com unidade e período, situação sempre com ícone e palavra.

## Papéis

| Ação | owner | admin |
|---|---|---|
| Painel, Pessoas, Produtos, Operação, Auditoria | Sim | Sim |
| Encerrar sessões, reenviar confirmação, banir e desbanir, desconectar computador Edi | Sim | Sim |
| Dinheiro e qualquer valor de receita | Sim | Não |
| Mudar papel (`users.set_role`) | Sim | Não |
| Exportar a auditoria | Sim | Não |

Ninguém bane conta owner ou admin pela tela, nem muda o próprio papel. A casa nunca fica sem owner ativo (com papel owner e sem banimento valendo): `setUserRole` e `setUserBanState` de `@informach/auth` pegam a mesma trava no banco (`pg_advisory_xact_lock`) antes de ler a conta e recusam com `LastOwnerError` rebaixar ou banir o último, inclusive com dois owners rebaixando um ao outro ao mesmo tempo. Mudar o papel de alguém, em qualquer direção, encerra na mesma transação as sessões dela no Postgres (Bastidores e Suíte Edi no navegador) e os aparelhos confiados: o papel novo só vale numa entrada nova.

**Ninguém se torna equipe sozinho.** Toda conta nasce `member` em qualquer produto, o campo `role` não aceita valor vindo do cliente (`input: false` em `@informach/auth`) e o cadastro do Bastidores é desligado. O primeiro owner é criado uma única vez pelo script `pnpm --filter @informach/admin bootstrap-owner <email>`, que se recusa a rodar quando já existe owner (salvo `--emergencia`, para quando nenhum owner consegue entrar). Daí em diante, só um owner dá ou tira papel, na ficha da pessoa, com duas etapas, motivo e registro na auditoria em nome de quem mudou. O script não cria conta nem senha, recusa conta banida ou com e-mail ainda não confirmado e, numa transação só, dá o papel, encerra as sessões que a conta tinha no Postgres e os aparelhos confiados e grava `user.role_changed`.

## Entrada

- Senha e depois o código do aplicativo autenticador (plugin `twoFactor` do Better Auth). O plugin só intercepta `/sign-in/email`, e o Better Auth tem outras rotas que criam sessão (confirmar e-mail por código com entrada automática, entrar por código no e-mail, link mágico). Por isso a rota `/api/auth/[...all]` só atende a lista fechada de `src/lib/auth-routes.ts` (senha, código, ativação, troca de senha, sair; o resto é 404, com teste), link mágico e entrada por código não carregam, e confirmar e-mail não cria sessão (`email.autoSignInAfterVerification: false`). Rota nova do Better Auth só entra na lista se não criar sessão sem a segunda etapa.
- Código em toda entrada: a rota recusa com 400 `verify-totp` e `verify-backup-code` quando o corpo traz `trustDevice` verdadeiro (o cookie de 30 dias do plugin faria a senha bastar), e a tela nunca manda. "Encerrar sessões" também apaga os aparelhos confiados da conta (`revokeTrustedDevices` de `@informach/auth/sessions`). As regras da rota ficam em `src/features/two-factor/gate.ts`, com teste.
- "Criar ou trocar a senha" usa código no e-mail (`email.forgetPassword: "otp"`), porque as contas da casa entram nos produtos por código e podem não ter senha. `sendStaffOnlyEmail` só entrega e-mail de autenticação a contas owner ou admin; para os demais responde como se tivesse enviado.
- Sem duas etapas ativas, toda tela leva a `/duas-etapas`. A senha é a mesma em todos os produtos e não prova que a pessoa é a dona da conta, então a ativação começa com um código de 6 números no e-mail da conta (categoria `auth.two-factor-setup-otp`, pelo `sendStaffOnlyEmail`; até 3 envios e 5 conferências por hora). Acertar grava uma prova de uso único, presa à sessão, que vale 10 minutos; a rota recusa `/two-factor/enable` com 403 sem ela, consome a prova antes de repassar e devolve se a senha não conferir. Os registros ficam em `core.verifications`, só com o HMAC do código no `identifier` (`src/features/two-factor/`). Depois vêm a senha, o QR, os códigos de recuperação e o primeiro código do aplicativo.
- Ao ligar as duas etapas, todas as outras sessões da conta são encerradas (no pacote, logo depois de `verify-totp`, mantendo só a sessão nova). Sem isso, uma sessão aberta só com a senha antes da ativação passaria a valer como completa. Como `core.sessions` é a mesma tabela da Suíte Edi, isso também encerra as sessões web da Suíte Edi da pessoa (o computador continua com a própria licença); Cozya, Agenda e Missão guardam a sessão no Redis de cada app e não são afetados. Se a limpeza falhar, nenhuma sessão fica de pé: saem todas as da conta, a nova junto, e se nem isso der o pacote desfaz as duas etapas (`two_factor_enabled` volta a falso). A tela pede para entrar de novo, e o Sentry recebe `auth.session_cleanup_failed` com o desfecho.
- Sessão de 12 horas, sem renovação e sem cache em cookie. `session.expiresIn` é também o teto no pacote, então nem `rememberMe: false` (que no Better Auth vira 1 dia) estica a sessão. Papel, banimento e duas etapas são lidos de `core.users` a cada pedido (`src/lib/access.ts`), então retirar o papel vale no próximo clique.
- Quem entra sem papel de equipe (ou banido) tem a sessão apagada no servidor, no ponto em que o acesso é negado (`getStaffState`); a tela "sem acesso" ainda limpa o cookie no navegador.
- Depois da entrada, a volta para a tela pedida passa por `safeNext` (`src/lib/safe-next.ts`), no servidor e no formulário: só caminho do próprio Bastidores, sem controle, barra dupla, barra invertida ou o mesmo escondido em percent-encoding.
- `BETTER_AUTH_SECRET` é próprio do Bastidores: é ele que impede um cookie de outro produto de valer aqui.

## Arquitetura

- `src/proxy.ts`: exige sessão em tudo, menos entrada, auth, saúde, rotinas e descadastro; aplica CSP com nonce, em modo de bloqueio desde o início.
- `src/app/(painel)/layout.tsx`: `requireStaff()` e o menu. Telas em `src/app/(painel)/*`.
- `src/features/<área>/`: `repository.ts` (consultas), `service.ts` (composição sem banco nem Next), `actions.ts` (server actions com `staffAction`), `components/`. O Biome proíbe páginas e rotas de importar o banco.
- Leitura pela conexão só de leitura (`readDb()`, `default_transaction_read_only`; `READONLY_DATABASE_URL` quando houver usuário próprio). Escrita só pelas funções dos pacotes (`setUserBanState`, `setUserRole`, `revokeDevice`, `revokeTrustedDevices`, `logAuditEventStrict`), no schema `ops`, nas sessões do Postgres (encerrar sessões e negar acesso) e nos registros próprios da prova por e-mail em `core.verifications` (`src/features/two-factor/repository.ts`).
- Sessões de Cozya, Agenda e Missão vivem no Redis de cada app (`cozya:auth:`, `agenda-da-turma:auth:`, `missao-saber:auth:`). Encerrar sessões apaga `core.sessions` e chama `revokeCachedSessions` em cada prefixo (`src/lib/redis.ts`). No Cozya e na Agenda, o cache em cookie ainda segura a sessão por até 5 minutos; a tela diz isso. A contagem "N sessões encerradas" só inclui as que estavam valendo. `revokeEverywhere` (`src/features/people/sessions.ts`) nunca lança: cada parte que falha (Postgres, aparelhos confiados, Redis de um app) volta como `null`, e a tela diz o que faltou. Isso importa no banimento, que faz commit antes de encerrar as sessões: a resposta sempre começa por "Conta banida", nunca por "nada foi alterado", e sai no tom de problema quando alguma parte faltou. Os aparelhos de estudo da Missão Saber têm acesso próprio, que encerrar sessões não alcança; o banimento bloqueia, e a confirmação de "Encerrar sessões" diz isso quando a conta tem aparelho conectado.
- Serviços conferidos em `src/lib/services.ts`: `/api/ready` diz se está pronto e `/api/health` diz a versão; o site responde pela página inicial. Resultado reaproveitado por 1 minuto. O "desde quando" vem de `ops.service_status`, mantido pela vigia.
- Cada rotina `/api/jobs/*` dos apps grava a execução em `ops.job_runs` por `recordJobRun`, só com números e booleanos do resultado.
- Avisos por e-mail: o aviso de queda (`admin.alert`) é operacional e chega mesmo para quem se descadastrou (só bounce ou denúncia de spam param a entrega), por isso sai sem link de descadastro no rodapé; o resumo da semana (`admin.weekly-summary`) obedece ao descadastro. Envio pulado não conta como enviado: a vigia reporta ao Sentry (`alert.delivery_skipped`) e, se o aviso não chegou a ninguém, a passada conta como falha em Operação. A resposta do link de descadastro diz exatamente isso, por categoria (`src/lib/unsubscribe-message.ts`).

## Desenvolvimento

```bash
pnpm dev:admin                    # http://localhost:3003
pnpm --filter @informach/admin test
pnpm --filter @informach/admin exec tsc --noEmit
```

Variáveis em `.env.example`. Em desenvolvimento, `ADMIN_SERVICE_URLS` aponta o painel para os apps locais. Nunca rode o Bastidores contra o banco de produção a partir da máquina local.

## Riscos conhecidos

Registrados nas revisões de 17/10/2026, sem correção por enquanto:

- **Descobrir quem é da equipe pelo tempo de resposta.** As rotas de autenticação respondem igual para qualquer e-mail, mas `sendStaffOnlyEmail` só renderiza e envia para owner e admin, então pedir código para uma conta da equipe pode demorar mais do que para outra. Medir isso de fora revelaria quem é da equipe, não a senha nem o código.
- **E-mail da pessoa na URL de busca.** A busca de Pessoas e o filtro da Auditoria vão na query (`?q=...`, `?pessoa=...`), então o e-mail digitado fica no histórico do navegador e nos logs de acesso do Railway e do Cloudflare.
- **Cancelar e assinar de novo em 24 horas conta como troca.** O movimento das assinaturas em Dinheiro trata uma assinatura nova que nasce até um dia antes ou depois do fim da antiga, no mesmo cliente de cobrança, como troca de plano (`REPLACEMENT_WINDOW_MS` em `src/features/money/logic.ts`): quem cancelou e assinou de novo nesse intervalo não aparece como cancelamento nem como assinatura nova.
- **`ownerEmails()` inclui owner banido.** Os avisos de queda e o resumo da semana vão para toda conta com papel owner, sem conferir o banimento. Hoje um owner não é banido pela tela (a regra exige rebaixar antes), mas um banimento direto no banco ainda receberia os e-mails.
- **Trocar a senha em outro produto não encerra a sessão do Bastidores.** A senha mora em `core.accounts`, compartilhada. O reset feito no próprio Bastidores apaga as sessões do Postgres (`revokeSessionsOnPasswordReset`), mas a troca feita em Cozya, Agenda ou Missão só mexe nas sessões daquele app, e a sessão aberta no Bastidores continua até as 12 horas acabarem ou alguém usar "Encerrar sessões".

# Operação e implantação da rotina familiar

Implementação e correções locais de 11/09/2026. Estes procedimentos preparam a implantação; não significam que produção foi alterada. As migrações 0035 a 0038 foram aplicadas somente ao PostgreSQL local. A correção dos achados está detalhada em [CORRECOES.md](CORRECOES.md).

## Ordem de implantação

1. Fazer backup e confirmar o banco e o ambiente de destino. Aplicar `0035_agenda_family_routine`, `0036_agenda_notice_recovery`, `0037_agenda_review_fixes` e `0038_agenda_notice_applications_backfill` com o fluxo usual `pnpm --filter @informach/db db:migrate`, antes de publicar o código. As duas primeiras introduzem família, recados, revisões, notificações, métricas e calendário privado; permitem nascimento e autoria nulos e tornam a turma privada por criador e turno. A 0037 acrescenta escopo explícito do original e aplicações por criança; a 0038 preenche essas aplicações a partir das providências de recados já confirmados. O escopo de originais antigos permanece desconhecido e privado até revisão explícita; não deve ser inferido das ações. Os registros existentes são preservados.
2. Executar o seed idempotente de preços de créditos (`seedAgendaCreditPricing`, incluído no seed do billing). O modelo de `agenda.notices.parse` deve coincidir com `AGENDA_MODELS`: `openai/gpt-4o`, um crédito por importação, independentemente do número de providências. Não editar o ledger manualmente para dar franquia a clientes.
3. Configurar URLs HTTPS de autenticação e app com a mesma origem, Redis, OpenRouter, Stripe, SendGrid e segredo de cron pelo gerenciador de segredos do ambiente. Reutilizar a configuração de billing e webhooks documentada no app. R$ 19,90/mês e R$ 199/ano continuam vindo do catálogo de produtos.
4. Configurar um par VAPID próprio em `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`. A interface informa indisponibilidade enquanto o par não estiver configurado. A chave privada não vai ao navegador. A ativação requer consentimento e compatibilidade; no iPhone/iPad orientar adicionar à tela inicial. Não migrar assinaturas push entre ambientes.
5. Agendar `pnpm --filter @informach/agenda-da-turma routine:job` a cada cinco minutos, fornecendo `NEXT_PUBLIC_APP_URL` e `CRON_SECRET` ao processo. O script chama o endpoint autenticado, percorre os lotes pelo cursor e retorna contagens agregadas. Agendar somente um POST sem percorrer `hasMore` atende apenas ao primeiro lote. Manter também os jobs existentes de billing, liberação de reservas e e-mail.

   Esse mesmo job carrega, desde 24/09/2026, dois encargos além do resumo diário: o **resumo de domingo** (dia e hora por família, fora do silêncio, com chave `weekly:<data do envio>` — reentrega não duplica) e a **retenção dos recibos da fila offline** (7 dias). Os dois rodam no fim da passagem, mesmo quando ninguém tem notificação ligada: retenção que depende de alguém ter opt-in não é retenção.
6. Publicar o build e executar smoke test em homologação: conta e OTP, texto + anexo, revisão, convite com login próprio, resumo e push consentidos, cancelamento de lembrete, revogação de acesso/feed e exclusão confirmada. Conferir CSP no navegador com `CSP_ENFORCE=1` e nenhuma violação de execução. Medir desempenho no build servido em aparelho representativo antes de usar alegações de velocidade.

O build local otimizado passou. A inicialização local com `next start` na porta 3012 foi bloqueada pela revisão automática de aprovação, que informou apenas `blocked by policy`. Portanto, os testes de navegação deste trabalho usam o servidor de desenvolvimento com CSP ativada; não constituem teste de runtime de produção. A configuração publicada anteriormente em report-only não foi alterada remotamente.

## Limites e comportamento

A identidade de login é compartilhada entre apps Informach. A tela de exclusão explica o alcance global e exige confirmação explícita. O servidor bloqueia a exclusão se outro app ainda tiver assinatura ativa ou recuperável, antes de cancelar a Agenda. O usuário precisa encerrá-la no outro app primeiro; o fluxo não cancela cobranças de outros apps silenciosamente.

| Tema | Regra implementada |
| --- | --- |
| Plano gratuito | Uma criança; até 20 pendências próprias somando escola, extras e recados. Concluídas e recebidas de outra família não consomem esse limite. Reabrir uma pendência verifica a mesma quota. |
| Teste de IA | Cinco resultados por conta verificada; reserva concorrente evita exceder. Teto global configurável, padrão 100 tentativas gratuitas em 24 horas; limite de dez tentativas por adulto gratuito e 70 no Pro em 24 horas. Limite adicional da rota: 12 chamadas/hora. |
| Reimportação | Mesmo conteúdo/contexto/páginas na família recupera o resultado sem novo débito. É possível aplicar a extração a outra criança autorizada; repetir a aplicação à mesma criança não duplica ações nem reinicia a data da primeira confirmação. Resultados prontos aparecem em “Falta conferir antes de salvar”. |
| Retificação | Uma possível mudança de prazo exige escolher entre atualizar a providência existente e manter uma obrigação separada. Atualização preserva identificador, conclusão e histórico, verifica versão e cancela entregas pendentes da versão anterior. O lembrete usado é o revisado na nova confirmação. |
| Anexo | Um arquivo PNG/JPEG/WebP/PDF até 5 MB; PDF com até 500 páginas, escolhendo no máximo três para a IA. Anexo original privado por 30 dias; acesso expira imediatamente e os bytes são removidos pelo job. Texto e providências continuam até exclusão da conta. |
| Interrupção | Resultado persiste antes do débito. Processamento abandonado por dez minutos é recuperado se a reserva foi confirmada; sem débito confirmado, libera a vaga para tentativa posterior. Jobs de billing liberam reservas vencidas. |
| Família | Pro inclui titular e um convidado, até três crianças do titular. Convite por e-mail verificado, token armazenado como hash, válido por 72 horas. Escopo por criança, revogável. Original não revisado fica restrito ao titular e ao adulto que o enviou enquanto autorizado. Para liberar a outro adulto, confirmar todas as crianças mencionadas, inclusive sem ações; ele precisa ter acesso a todas. Reutilização nunca estreita silenciosamente um escopo já declarado. |
| Downgrade | Dados e acessos existentes permanecem consultáveis. Correções e conclusão continuam possíveis. Novos benefícios pagos ficam bloqueados; recorrência, resumos e lembretes ficam pausados. |
| Turma | Conhecer escola, série, letra, ano e turno não dá acesso a outra família. Entrada depende do código; criador pode trocar o código e remover participantes. |
| Calendário externo | Feed privado, unidirecional, por token revogável; janela de 30 dias anteriores a 365 dias futuros. Prazo de atualização depende do cliente de calendário. Atualização/cancelamento preserva UID e publica versão. |

O teste de IA concede cinco créditos promocionais uma única vez, de forma idempotente. Falhas sem débito não consomem resultados do teste; tentativas contam para o teto de abuso. A franquia comercial não representa custo em reais do modelo. O relatório do piloto deve confrontar consumo e faturas efetivas.

## Entrega dos lembretes

- Fuso da rotina: America/Sao_Paulo. Horário padrão de resumo: 19h; silêncio padrão: 21h–7h. Ambos configuráveis. A sugestão de antecedência exige ação da pessoa: dois dias para material/prova/trabalho e um dia para outros tipos, às 19h. Ela não muda o prazo da escola.
- E-mail exige conta verificada e consentimento. Push exige assinatura do dispositivo e consentimento; o texto na tela bloqueada omite criança e conteúdo escolar.
- Cada entrega tem chave estável, claim atômico e até três tentativas. Repetição de job não duplica a entrega já registrada. Antes de enviar, o worker consulta novamente plano, acesso, status, data, preferências e dispositivo; uma providência cancelada ou concluída não gera novo lembrete.
- Falha/claim abandonado é elegível para nova tentativa após dez minutos. Um envio em andamento ou de resultado incerto fica adiado e não consome tentativas nem cancela definitivamente a notificação. A camada de e-mail reconcilia o resultado antes de decidir se pode reenviar; `sent`/`delivered` impedem reenvio. Investigar resultados `unknown` persistentes. O corpo de e-mail escolar não fica persistido no histórico de entrega nem entra no retry genérico: a rotina regenera o conteúdo com as permissões atuais.
- Resumos saem na hora escolhida. Lembretes atrasados podem ser recuperados por até 24 horas, respeitando silêncio. Se o serviço ficar fora durante toda a hora do resumo, aquele resumo não será enviado posteriormente; monitorar falhas e ausência de execução do scheduler.
- Cada chamada atende até 20 adultos e um orçamento de aproximadamente 40 segundos, continuando pelo cursor. O runner percorre os demais lotes. Testar duração real com o provedor antes de escalar; os limites evitam uma única chamada sem término previsível.
- E-mails já aceitos pelo provedor e cópias já baixadas por um calendário não podem ser recolhidos por revogação posterior. A revogação bloqueia leituras e entregas futuras no app.

## Verificação reproduzível

Na raiz do monorepo:

```powershell
pnpm --filter @informach/agenda-da-turma --filter @informach/auth --filter @informach/billing --filter @informach/emails --filter @informach/db typecheck
pnpm --filter @informach/agenda-da-turma --filter @informach/auth --filter @informach/billing --filter @informach/emails test
pnpm --filter @informach/agenda-da-turma test:integration
```

Integração exige `.env.local` apontando para PostgreSQL local e a base de cidades de referência. Os testes usam adultos e crianças fictícios, assinatura local sintética e e-mails em memória; limpam as próprias fixtures. Não usam uma assinatura real da Stripe.

Para o navegador, usar app local com e-mail em sandbox e informar o mesmo diretório ao teste:

```powershell
$env:E2E_BASE_URL='http://localhost:3001'
$env:EMAIL_SANDBOX_DIR='./tmp/implementation-emails'
pnpm --filter @informach/agenda-da-turma exec playwright test --config playwright.routine.config.ts
```

Os testes usam Microsoft Edge instalado, contas sintéticas, verificações por OTP em sandbox no fluxo familiar e login normal com credenciais sintéticas no teste das correções. O arquivo de configuração exige app e banco locais. Em uma sessão exclusiva de testes, o servidor de desenvolvimento pode usar `E2E_RELAX_AUTH_RATE_LIMITS=1`; essa opção é rejeitada em produção. Os testes não reduzem proteções do servidor automaticamente.

Avaliação opcional com uso real do provedor, incluindo imagens e PDFs gerados apenas com conteúdo fictício:

```powershell
$env:AGENDA_RUN_AI_EVAL='1'
pnpm --filter @informach/agenda-da-turma test:ai-eval
```

Produz `tmp/evaluation/notices-latest.json`, com resultados e tokens. O corpus sintético não substitui a avaliação com amostras autorizadas do piloto. Resultado de teste não autoriza tratar datas sem revisão humana.

## Monitoramento e recuperação

Executar `pnpm --filter @informach/agenda-da-turma pilot:report` para leitura agregada dos últimos 30 dias. Um argumento numérico substitui a janela (1–365). A consulta é uma transação somente de leitura. Proteger o acesso operacional ao relatório mesmo sem nomes de crianças.

Investigar crescimento de `notice_failed`, tentativas sem confirmação, reservas ativas vencidas e entregas `failed`. O runner sai com código não zero se houver falhas; configurar alerta e registrar última execução concluída. Não incluir mensagem, anexo, token de convite/feed ou texto de providência em logs de suporte.

Se precisar pausar o teste gratuito por custo, configurar `AGENDA_TRIAL_DAILY_BUDGET=0`; o cadastro manual e os dados existentes permanecem acessíveis. Se precisar pausar entregas, suspender o scheduler e manter as preferências. Uma nova execução deve sempre usar as permissões atuais.

As migrações são expansivas, mas as novas rotas dependem delas. Em rollback de aplicativo, manter tabelas e dados adicionados; não executar `db:push` nem remover tabelas para voltar uma versão. Investigar e corrigir para frente usando backup apenas em recuperação planejada.

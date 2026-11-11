# Ciclo de privacidade da conta Compasso

Plano de implementação de 10/11/2026. Este documento separa os contratos que serão
implementados das evidências de execução; não registra uma funcionalidade já publicada.

## Responsabilidades

A identidade autenticada é compartilhada no `core.users`. Encerrar dados de um app,
sair de uma família, cancelar uma assinatura e excluir a identidade são ações distintas.
Ser pagante não concede autoridade sobre conteúdo de outro adulto. Pessoas canônicas,
ativações e históricos familiares não podem ser apagados em cascata quando um adulto sai.

`@informach/account` compõe a jornada e os estados duráveis. `auth` protege identidade,
autenticação recente e revogação; `family` determina os vínculos e responsabilidades;
`billing` preserva os recibos e encerra as renovações autorizadas. Cada domínio mantém
sua exportação e limpeza autorizadas, sem a central duplicar consultas de conteúdo.

## Ordem de implementação

1. **Identidade:** troca de e-mail comprovando posse dos endereços atual e novo,
   autenticação recente e invalidação dos acessos afetados. A troca não reinicia a
   elegibilidade do teste. E-mail global e contato fiscal não são confundidos.
2. **Exportação:** cópia da conta, vínculos autorizados e cobrança do próprio pagante;
   acesso às exportações de cada app com o contexto familiar explícito. Não incluir
   tokens, chaves, OTPs, prompts privados de terceiros ou conteúdo sem concessão atual.
3. **Prévia de encerramento:** identificar responsabilidades exclusivas, participação
   em outras famílias, contratos pendentes, reservas de IA e vínculos de outros produtos.
   Resolver transferência ou encerramento explícito de cada responsabilidade antes da
   destruição irreversível. Não inferir consentimento para apagar Edi ou outra família.
4. **Execução retomável:** congelar novas operações, revogar acessos, reconciliar
   cobrança e IA e limpar os domínios com recibos idempotentes. Falha externa deixa
   estado recuperável e visível; não retorna sucesso enquanto houver etapas pendentes.
5. **Identidade encerrada:** remover credenciais e dados identificadores elegíveis,
   conservar apenas referências e registros necessários nos domínios financeiros e
   de segurança. Preservar a prova irreversível de uso do teste e os dados pertencentes
   a outras pessoas. Não inventar um prazo geral de retenção para todos os registros.

## Verificação obrigatória

### Dependência: transferência da responsabilidade pelo cadastro

A administração da família não concede a guarda do cadastro comum de uma pessoa.
Antes de permitir que o último responsável encerre a conta, a central precisa oferecer
uma transferência explícita a outro adulto verificado da mesma família, com aceite na
conta de destino. O convite identifica a pessoa e a revisão do cadastro; mudança de
revisão, saída da família ou perda da responsabilidade invalida o aceite. A confirmação
troca somente o responsável pelo cadastro compartilhado. Permissões e históricos dos
aplicativos permanecem separados e precisam ser tratados na prévia de encerramento.

Implementação incremental: tabela de pedidos com validade e resolução auditável;
operações no domínio family com travas família/pessoa/pedido; visualização restrita aos
dois adultos; formulários de pedido/aceite/recusa; testes de concorrência, revogação,
repetição e preservação das permissões locais. Nenhuma transferência de produção é
executada como parte da implementação.

Transferência implementada na 0138. Solicitar/aceitar exige entrada recente; os dois
adultos podem cancelar o pedido. Tipos, quatro casos de domínio e as duas jornadas de
navegador passaram. A revisão acrescentou a trava da pessoa às mutações que dependem
de responsabilidade; um quinto teste observa esperas reais no PostgreSQL para provar
que o antigo responsável não consegue arquivar a pessoa em outra família depois do
aceite. Regressão combinada: família 35, billing 63, account 3, Edi 7, auth 19, doze
cenários centrais e dois de créditos aprovados. Logs no registro de implementação.

O inventário de saída de família, implementado e verificado em banco, distingue participação, custódia
global e gestão dos históricos. Inclui responsabilidades de pessoas arquivadas e de
adultos já removidos do contexto, evitando considerar a falta de vínculo como permissão
para apagar. Nenhuma consulta de prévia autoriza exclusão; o executor precisará reler
esses fatos ao congelar a operação. A composição financeira e de identidade compartilhada
passou em banco. A tela de conferência está em verificação no navegador; ainda faltam
avaliação dos dados locais, tratamento das responsabilidades pendentes e execução durável
nos domínios. Exibir ausência de pendências comuns não equivale a autorizar exclusão.

### Evidência de identidade e exportação

Incremento de identidade implementado localmente: OTP nativo do Better Auth confirma ambos
os endereços, com sessão central de até 15 minutos. **0136** impede outro teste para a
mesma identidade; **0137** revoga raízes web, provas antigas e convites pendentes para
o endereço liberado, atomicamente. IDs, fatores, contratos e sessões independentes de
Edi/Bastidores são conservados. Tipos, ensaios de banco e jornada visual passaram.

Exportação comum implementada e verificada em foco: leitura viva paginada, escopo
explicitamente limitado à conta/famílias autorizadas/cobrança do pagante, sem conteúdo
dos apps ou segredos. Reautenticação em até 15 minutos, quatro solicitações por hora,
recusa de origem externa, `no-store` e interrupção por revogação/cancelamento. A auditoria
de conclusão precede o fechamento do JSON; comprova geração, não salvamento no aparelho.
Três testes PostgreSQL da composição e duas jornadas de navegador (computador/celular)
passaram, incluindo 22 famílias e extratos com mais de 200 lançamentos. Capturas revisadas.
Regressão compartilhada em execução. Encerramento global ainda está em implementação.

- Atores sem vínculo, revogados, pagante sem concessão e conta de outro adulto.
- Mudança concorrente de permissões, responsabilidade ou saldo depois da prévia.
- Reinício após falhas entre cobrança, limpeza de conteúdo e encerramento da identidade.
- Exportação e exclusão não podem recuperar dados após revogação nem ressuscitar
  resultados de IA em uma resposta atrasada.
- Troca de e-mail conserva identidade e histórico, recusa OTP inválido/repetido,
  exige autenticação recente e não concede novo teste em outra família.
- Navegador em computador/celular e regressão dos consumidores, Bastidores e Edi.

Referência da API instalada: Better Auth 1.7.10; a documentação de
[troca de e-mail por OTP](https://better-auth.com/docs/plugins/email-otp#change-email-with-otp)
é conferida contra o código da versão fixada no lockfile. Dependências não são atualizadas
como parte desta frente.

## Execução durável: contrato a implementar

Incremento de 10/11: 0140/0141 implementam **avaliações de leitura** persistentes por app e índice de vencimento. Sete novos ensaios PostgreSQL cobriram concorrência, retomada, revisão cancelada/expirada, identidade revogada, ausência de resposta e expurgo. Os cinco adapters e a projeção familiar passaram no banco. A central solicita/acompanha respostas, com jornada desktop/mobile verificada em foco; resultados completos ainda são somente uma avaliação temporária, sem autorização para apagar. Retenção do cache: 24 horas após vencer, removido em lotes limitados, sem alterar auditoria ou conteúdo. Falhas parciais dos workers são 503 e falha operacional; um bloqueio real de tabela confirmou retomada posterior. IaC e Bastidores estão preparados, sem provisão remota. Esses registros não são os pedidos irreversíveis abaixo: não congelam escritores nem autorizam limpeza de dados pessoais. A regressão completa da central passou (14 jornadas), após ajustar a expectativa da fixture desktop/mobile que deixa deliberadamente uma revisão vencida para o teste seguinte.

O próximo incremento usa o PostgreSQL existente para coordenar pedidos e etapas.
Não introduzir outro provedor nem fazer a Conta importar código de outros apps.
Os pontos seguintes são plano de implementação, ainda não uma entrega funcional.

- [ ] `account` mantém pedido imutável de escopo/ator, revisão da prévia e destinos
  explicitamente escolhidos; etapas possuem estado, tentativas, prazo de posse e
  recibos idempotentes. Dados do conteúdo não entram no pedido ou na auditoria.
- [ ] O catálogo `config` determina todos os apps web da coleção, inclusive apps
  com dados ainda não publicados. Cada domínio implementa seu adapter de avaliação
  e limpeza no próprio app. App sem adapter ou indisponível impede conclusão;
  ausência de resposta nunca significa ausência de dados. A fila compartilhada é
  consumida por jobs de cada app, com identificador do app fixo na composição.
- [ ] A prévia de domínio distingue dados pessoais, históricos familiares sob gestão,
  dados de terceiros e operações ainda em execução. Extrair e reutilizar os serviços
  de limpeza existentes, preservando travas de perfis, dispositivos, reservas e a
  limpeza de conteúdo Mastra. Não criar uma segunda lista de tabelas para apagar.
- [ ] `auth` mantém estado de participação web separado da identidade global. A
  confirmação congela novos trabalhos web, preservando Edi/Bastidores, e revoga
  raízes/filhos web. Escritores e jobs precisam conferir esse estado **dentro** de
  suas transações, com a mesma trava do congelamento; só testar sessão na entrada
  não impede uma resposta de IA atrasada de recriar conteúdo.
- [ ] Depois de congelar, os domínios reavaliam a revisão aprovada. Mudança de conteúdo
  ou autoridade exige nova conferência antes de efeitos irreversíveis. Enquanto a
  preparação não produziu esses efeitos, o pedido pode ser cancelado e o acesso
  restabelecido com nova autenticação. Depois disso, falhas são retomadas e mostradas
  como pendência, preservando recibos das etapas concluídas.
- [ ] Cobrança concilia compras, períodos, renovações e reservas do próprio pagante.
  Créditos familiares e conteúdo de outros adultos não são apagados pela saída de um
  membro. Destinos de saldo e perda de acesso são apresentados antes da confirmação;
  não inventar reembolso, vencimento ou uma regra de retenção geral.
- [ ] Finalização verifica ausência das dependências necessárias e conserva registros
  fiscais/de segurança e prova de uso do teste. A identidade global só pode ser tratada
  no escopo explicitamente aprovado e depois de resolver todos os produtos independentes.

Verificação por incremento: travas concorrentes reais no PostgreSQL; perda/reassunção
de posse da etapa; reinício entre efeito e recibo; repetição; autoridade revogada;
novo dado entre prévia e confirmação; respostas de IA/dispositivos atrasadas; falha
de um domínio preservando os demais; dados de outro adulto e Edi inalterados. A
central não exibirá conclusão enquanto existir qualquer etapa ou responsabilidade
pendente. A documentação operacional deverá indicar o processo que consome cada
fila e sua configuração efetiva no Railway, sem confundir código com implantação.

## 10/11 — Trava de participação e respostas tardias

Implementada a base de participação `active/frozen/closed` de `auth`, com revisão e identificação da operação. A nova **0142_web_participation** pertence a privacidade; não é a migration contratual de mesmo número retirada antes da publicação. Operações de domínio seguram `FOR SHARE` na participação e o congelamento toma `FOR UPDATE`. Transição, revogação das raízes web e auditoria são atômicas, sem banir/excluir a identidade ou atingir sessões independentes. Conta continua podendo autenticar para acompanhamento; vinculação SSO aos apps é recusada enquanto suspensa. API interna não foi exposta como botão/rota de encerramento.

Família integra a trava nas mutações e nos helpers dos consumidores; consultas de concessão também recusam participação suspensa. O teste histórico 0082 verifica seus dados com as colunas daquela versão e só chama os serviços atuais depois de aplicar o schema completo. Preservação de perfis, homônimos, concessões, revogação e repetição da migration continuam verificadas, sem criar tabela futura manualmente na fixture histórica.

A **0143_ai_web_participation_revision** conserva a revisão nos recibos IA e no cache HTTP Cozya. Agenda/Cozya reautorizam antes de persistir saída e antes de devolver resultado. Congelar e retomar não revalida uma resposta antiga. Recuperação Cozya observa a participação sob trava para descartar cache incompatível; resolução da reserva conserva sua autorização financeira anterior. Testes reais exercitaram resposta posterior ao congelamento e posterior à retomada, com conteúdo ausente, reserva liberada e nenhum débito.

Evidência local: auth **29/5**, família **38/9**, IA Agenda **10/1** e Cozya **14/1**, tipos dos packages/apps afetados. Logs `web-participation-pg`, `web-participation-family-pg2` e `ai-participation-pg` com prefixo `.codex-compasso-`. Bases descartáveis removidas. A extensão às escritas pessoais do Cozya passou em tipos, 29 testes de banco/3 arquivos e 125 unitários/24 arquivos; leituras/exportação ainda precisam da revisão final.

Ainda não há executor global: faltam pedido imutável, reavaliação autorizada enquanto congelado, adapters de limpeza, conciliação de cobranças/reservas, revogação definitiva de credenciais de aparelhos e retomada segura. A retomada deve retirar os caches da revisão antiga **depois** de resolver reservas, para permitir novas solicitações iguais sem recuperar conteúdo invalidado. Os demais caminhos pessoais/jobs precisam ser auditados. A avaliação atual não chama congelamento; nenhuma operação de produção foi alterada.


### Continuidade: consumidores e credenciais

Leituras/exportação Cozya foram integradas, com regressão de **55/7** em banco; Bora pessoal/rotinas passou **43/5**. A 0144 registra revisão nos aparelhos Missão/Dia e calendários Agenda para impedir reativação após retomada, sem depender de um worker conseguir apagar a credencial antes. Emissão/uso permanecem autorizados por família e concessões. Revisão também governa indicação de atividade/capacidade. Os caminhos pessoais de Missão, push Dia, notificações Agenda e administração restante estão em validação de banco. O executor deve continuar limpando credenciais e caches; invalidá-los por revisão resolve a segurança da retomada, não a retenção nem o encerramento.


## Protocolo do coordenador — núcleo implementado, adapters em integração

O núcleo e as tabelas `account.web_closures`/`web_closure_steps` foram implementados na 0145, gerada pelo Drizzle e aplicada apenas em bases descartáveis. Ainda não há rota pública, botão de confirmação nem workers de encerramento habilitados. A aprovação do núcleo não certifica a limpeza dos sete domínios.

1. Uma sessão central recente solicita a preparação, referenciando uma avaliação
   completa vigente. O pedido captura ator, escopo, catálogo e revisão, e congela
   participação na mesma transação. Essa fase não autoriza efeitos irreversíveis.
   A sessão é revogada; acompanhamento e confirmação pedem nova autenticação.
2. Os cinco apps, `family` e `billing` preparam planos próprios sob a autoridade
   exata do pedido. A Conta guarda somente indicadores, impedimentos e uma impressão
   da seleção de IDs/versões, sem conteúdo ou segredo. A prévia anterior por contagens
   não é suficiente para autorizar exclusão. Planos ausentes/pendentes impedem avançar.
3. A confirmação recente aceita a impressão do conjunto preparado. O pedido passa a
   execução e não admite desistência que possa reabrir uma conta parcialmente apagada.
   Cada domínio reavalia autoridade e impressão dentro da transação de seus efeitos.
   Mudança incompatível mantém a etapa pendente, sem ampliar a exclusão aprovada.
4. Antes dessa confirmação, a desistência inicia uma fase de retomada, não uma simples
   chamada a `resumeWebParticipation`. Primeiro billing resolve reservas; depois os
   apps retiram caches inválidos e referências temporárias. Só então a central retoma
   participação e exige nova entrada. Credenciais da revisão antiga continuam inválidas.
5. Na execução, billing concilia e interrompe renovações autorizadas antes da limpeza;
   apps removem apenas dados autorizados; família resolve vínculos por último. A
   identidade global e Edi/Bastidores permanecem fora do escopo Compasso. O fechamento
   da participação ocorre em uma transação final, depois de todos os recibos.

Cada etapa tem fase, domínio fixado na composição, tentativas, disponibilidade, prazo
 e token de posse. O worker recebe a identidade do banco, nunca do corpo HTTP. A posse
 vencida não autoriza efeito ou recibo. Efeitos PostgreSQL e recibo usam a mesma transação;
 I/O externo fica fora dela e exige a idempotência do domínio (Stripe/Mastra/reservas).
 Não chamar um callback externo mantendo travas de família ou participação.

Ordem de travas do executor: pedido → família/contexto → participação → conteúdo.
 As solicitações centrais e a finalização serializam primeiro o ator e as alterações de sessões web; só então tomam a sessão exata e/ou o pedido. Isso evita inversão entre acompanhamento autenticado, revogação de navegadores e finalização.
 O congelamento e a transição final não tomam travas de família/conteúdo. A finalização
 roda separadamente do callback de limpeza para não inverter essa ordem. Recibos e
 auditoria registram operação/domínio/fase/resultado, sem erro cru nem conteúdo.

O coordenador não duplicará listas de tabelas dos apps. A limpeza local existente será
 extraída em primitivas transacionais, com autorizações de entrada distintas: sessão
 ativa na ação local e pedido congelado no worker. A seleção de perfis a preservar ou
 remover pertence a `family` e ao domínio do app; não usar o antigo `user_id` criador
 como proprietário de um histórico compartilhado. Responsabilidade de outro adulto
 suspenso continua sendo vínculo a preservar, mesmo que ele não esteja disponível
 para assumir administração naquele momento.

Gates do núcleo aprovados em PostgreSQL: intenção/congelamento atômicos, sessão antiga/forjada, avaliação vencida/incompleta,
 catálogo divergente, replay, dois pedidos concorrentes, posse expirada, rollback do
 efeito e do recibo, retomada parcial, impedimento informado por domínio, registro de outro ator,
 falha/reinício entre etapas, mudança de catálogo e ausência de recibo. Account passou **21 testes/4 arquivos** e auth **30/5**, com tipos de db/auth/account aprovados. Mudanças de autoridade e limpeza real de cada domínio continuam exigindo os testes dos adapters. A UI só pode declarar encerrado depois da finalização persistida; nada disso está habilitado agora.

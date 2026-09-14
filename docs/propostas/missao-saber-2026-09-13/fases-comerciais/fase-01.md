# Fase 01: Disponibilidade do catálogo sem aprovação editorial

[Voltar ao plano completo](../PLANO-VERSAO-COMERCIAL.md)

**Estado:** concluída e revisada.  
**Complexidade:** Alta.  
**Dependências:** Nenhuma fase funcional anterior. Levantar o estado atual da branch e os arquivos em edição pela sessão de design.

## Objetivo

Permitir que o responsável compre e que o estudante acesse o conteúdo do plano sem uma fila de aprovações. A política passa a ser catálogo disponível por padrão, com suspensão pontual para incidentes.

## Tarefas de implementação

### F1.1: Registrar a nova regra de produto

- [x] Implementado e verificado.

Atualizar PRD, especificação e runbook durante a implementação: aprovação humana de conteúdo deixa de ser requisito de checkout, início de missão, diagnóstico, simulado e recomendação. Remover o fluxo editorial que nunca foi usado; não criar aprovações ou atribuir revisões fictícias a Helena. A migration de produção elimina a tabela vazia anterior.

### F1.2: Centralizar a disponibilidade

- [x] Implementado e verificado.

Criar uma única política que combine existência do conteúdo, suspensão explícita, plano, ano/trilha e perfil autorizado. Aplicá-la tanto no serviço quanto na transação de início, além de Hoje, Jornada, Revisão, Simulados e Família. Preço configurado e confirmação do pagamento continuam necessários.

### F1.3: Definir suspensão e reativação

- [x] Implementado e verificado.

Disponibilidade passa a depender de uma decisão operacional por missão, não de um hash aprovado. Uma suspensão permanece em novos deploys até reativação explícita. Preservar o histórico de versões e a auditoria das mudanças. Criar migration aditiva pelo Drizzle se o modelo atual não expressar essa regra com clareza.

### F1.4: Preservar sessões e tratar conteúdo suspenso

- [x] Implementado e verificado.

Snapshots e respostas anteriores continuam legíveis. Quando uma missão for suspensa por erro, impedir novas tentativas nessa missão, orientar a retomada de outro conteúdo e conservar respostas já registradas. Oferecer encerramento parcial explícito quando não houver substituição adequada. Registrar os itens e versões afetados pelo erro; excluir suas evidências dos cálculos sem invalidar respostas corretas de outras atividades. Centralizar esse filtro para a correção de relatos da fase 5.

### F1.5: Adaptar os controles administrativos

- [x] Implementado e verificado.

Transformar as ações obrigatórias de aprovação em operações de manutenção: consultar versão, suspender e reativar. Usar a autenticação administrativa existente. Reativar conteúdo é uma ação excepcional de correção, não uma aprovação exigida a cada publicação.

### F1.6: Rever mensagens e proteger o acesso pago

- [x] Implementado e verificado.

Remover mensagens funcionais de aguardando aprovação e os testes que esperam esse bloqueio. Conferir que retirar o bloqueio editorial não libera conteúdo pago a conta gratuita, perfil excedente ou assinatura inadimplente. Ajustar o texto funcional com os componentes da sessão de design.

## Áreas existentes a modificar

Os caminhos abaixo são pontos de partida da inspeção atual. A implementação deve confirmar o estado dos arquivos e preservar alterações da sessão de design.

| Arquivo | Motivo |
| --- | --- |
| [apps/missao-saber/src/features/content/version.ts](<../../../../apps/missao-saber/src/features/content/version.ts>) | hash e antiga regra isApproved |
| [apps/missao-saber/src/features/learning/recommendation.ts](<../../../../apps/missao-saber/src/features/learning/recommendation.ts>) | seleção das missões disponíveis |
| [apps/missao-saber/src/features/learning/service.ts](<../../../../apps/missao-saber/src/features/learning/service.ts>) | início, retomada e regras de acesso |
| [apps/missao-saber/src/features/learning/repository.ts](<../../../../apps/missao-saber/src/features/learning/repository.ts>) | validação transacional e snapshots |
| [apps/missao-saber/src/features/content-maintenance/service.ts](<../../../../apps/missao-saber/src/features/content-maintenance/service.ts>) | suspensão e reativação |
| [apps/missao-saber/src/features/content-maintenance/repository.ts](<../../../../apps/missao-saber/src/features/content-maintenance/repository.ts>) | histórico e concorrência operacional |
| [apps/missao-saber/src/features/billing/service.ts](<../../../../apps/missao-saber/src/features/billing/service.ts>) | preservar autorização da compra |
| [packages/db/src/schema/missao-saber.ts](<../../../../packages/db/src/schema/missao-saber.ts>) | eventual representação aditiva da disponibilidade |

Novos módulos e artefatos previstos, sujeitos à organização final da implementação:

- apps/missao-saber/src/features/content/availability.ts: política compartilhada de disponibilidade.
- Testes específicos da política e migration gerada, se necessária.

## Integração com a sessão de design

Família, Hoje, Jornada, Revisão, Simulados e a página administrativa recebem mudanças de comportamento. Layouts, classes, tokens e ilustrações pertencem à sessão de design; a adaptação deve consumir seus componentes, com alterações pontuais coordenadas.

## Validação necessária

- [x] Conta sem registro editorial inicia a unidade gratuita e, com assinatura válida, missões disponíveis do plano.
- [x] Checkout independe de trilha aprovada e preserva família, preço, confirmação e locks de cobrança.
- [x] Gratuito não inicia missão paga; Individual não autoriza perfil excedente; assinatura past_due não concede Pro.
- [x] Suspensão concorrente com início é serializada no banco.
- [x] Suspensão independe de hash; reativação não altera snapshots antigos.
- [x] Sessão suspensa permanece no histórico e pode ser encerrada sem fabricar conclusão; invalidação é específica por item e conteúdo.
- [x] Recomendações, diagnóstico e simulados usam apenas fontes disponíveis.

Executar os testes pertinentes sobre a versão que contém a fase e registrar seus resultados. Usar banco descartável para cenários de integração; não modificar dados reais para simular estados de teste. A verificação com provedores da fase 04 e a publicação da fase 06 seguem as condições específicas do plano mestre.

## Review da fase

Revisar a implementação depois dos testes, incluindo caminhos de erro, autorização, concorrência, preservação de dados e consequências didáticas. Conferir também os estados de interface alterados em conjunto com os componentes de design.

Registrar cada achado, sua correção e a verificação correspondente. Não encerrar a fase com defeitos do escopo transferidos silenciosamente para a próxima. Esse review é parte da execução e não exige aprovação editorial da responsável.

O relatório será criado em `evidencias/fase-01.md`, com versão/diff, tarefas entregues, comandos/resultados, achados/correções e limitações. Não registrar revisão automática como revisão humana realizada por Helena.

## Critérios de conclusão

- [x] Zero dependências de aprovação humana nos caminhos de compra e estudo.
- [x] Uma política canônica de disponibilidade aplicada na interface e no servidor.
- [x] Retirada excepcional, histórico e proteção de plano verificados com PostgreSQL real em banco descartável.
- [x] Relatório de review da fase sem achados pendentes.

## Entregáveis

- Política implementada e documentada.
- Controles de suspensão/reativação.
- Regressões e evidências do review F1.

Concluídos os critérios e o review, avançar para a [fase 02](fase-02.md).

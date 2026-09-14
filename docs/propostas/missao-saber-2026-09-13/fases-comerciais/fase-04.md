# Fase 04: Assinatura Família e jornada completa de uso

[Voltar ao plano completo](../PLANO-VERSAO-COMERCIAL.md)

**Estado:** concluída e homologada.  
**Complexidade:** Alta.  
**Dependências:** Fases 01–03 concluídas; billing, perfis e provedores homologados.

## Objetivo

Deixar o caminho de compra e estudo fluido para a responsável e até três filhos, com isolamento de progresso e cobrança correta. A configuração já publicada será aproveitada e homologada de ponta a ponta.

## Tarefas de implementação

### F4.1: Concluir o onboarding familiar

- [x] Implementar e verificar.

Permitir cadastro ou entrada com conta Informach existente, confirmação de e-mail, escolha do Família, pagamento e criação/seleção dos perfis. Garantir que a criação interna da família não obrigue cadastrar um estudante fictício para comprar. Oferecer caminho gratuito coerente para quem começa estudando antes de assinar.

### F4.2: Garantir contexto por estudante

- [x] Implementar e verificar.

Até três perfis no Família, cada um com ano, trilha, progresso, revisão e caderno. Seleção é por sessão/dispositivo; dois filhos em aparelhos diferentes não mudam o perfil um do outro. Troca de trilha preserva histórico e pré-requisitos compartilhados. Os perfis pertencem à conta do responsável; isso não implica criar contas ou e-mails individuais para as crianças.

### F4.3: Proteger operações do responsável

- [x] Implementar e verificar.

Compra, gestão da assinatura, exclusão, exportação e configurações sensíveis exigem confirmação recente do adulto. Estudar, pedir pista, retomar e salvar não exigem reautenticação a cada missão. Apresentar retorno claro quando uma operação sensível precisa de novo login.

### F4.4: Consolidar acesso e limites

- [x] Implementar e verificar.

Após confirmação do pagamento, atualizar o plano sem nova compra. Tratar webhook atrasado/duplicado, checkout abandonado, renovação, inadimplência, upgrade, downgrade e cancelamento. Preservar acesso durante o período já pago quando o cancelamento estiver agendado para seu fim; bloquear Pro quando o estado canônico deixar de permitir acesso. Explicitar no fluxo de alteração quando a mudança e sua cobrança entram em vigor, conforme a política configurada. Se reduzir o plano, preservar todos os perfis e permitir ao responsável escolher quais permanecem ativos, sem apagar dados nem conceder acesso pago excedente.

### F4.5: Homologar a Stripe de verdade no modo de teste

- [x] Implementar e verificar.

Criar clientes/assinaturas identificados como teste deste app e executar checkout com cartão de teste, Portal, alteração de plano, falha de pagamento, renovação acelerada quando suportada e cancelamento. Encaminhar os eventos ao ambiente local/isolado e verificar estado no banco. Não confundir fixtures locais ou evento sintético assinado com esse teste do provedor.

### F4.6: Validar e-mails transacionais

- [x] Implementar e verificar.

Verificar código de confirmação, login/recuperação e mensagens de assinatura no remetente atual, com links corretos e entrega acompanhada pelo coletor assinado. Usar a caixa da responsável ou destinatário de teste autorizado. Preservar idempotência, preferências e segregação de remetente entre apps.

### F4.7: Exercitar a jornada familiar

- [x] Implementar e verificar.

Executar uma jornada completa com três perfis em desktop/celular e mais de um dispositivo: escolher trilhas, estudar formatos diferentes, pausar, retomar, trocar perfil, revisar, consultar relatório e gerenciar assinatura. Produzir roteiro para a compra real que a responsável fará após a fase 6.

## Áreas existentes a modificar

Os caminhos abaixo são pontos de partida da inspeção atual. A implementação deve confirmar o estado dos arquivos e preservar alterações da sessão de design.

| Arquivo | Motivo |
| --- | --- |
| [apps/missao-saber/src/components/auth-form.tsx](<../../../../apps/missao-saber/src/components/auth-form.tsx>) | entrada e confirmação |
| [apps/missao-saber/src/components/controls.tsx](<../../../../apps/missao-saber/src/components/controls.tsx>) | criação e ações de perfil |
| [apps/missao-saber/src/features/learning/actions.ts](<../../../../apps/missao-saber/src/features/learning/actions.ts>) | ações autenticadas e seleção |
| [apps/missao-saber/src/features/learning/service.ts](<../../../../apps/missao-saber/src/features/learning/service.ts>) | limites, perfil e mudança de curso |
| [apps/missao-saber/src/features/billing/service.ts](<../../../../apps/missao-saber/src/features/billing/service.ts>) | checkout, Portal e entitlement |
| [apps/missao-saber/src/features/billing/repository.ts](<../../../../apps/missao-saber/src/features/billing/repository.ts>) | família compradora e locks |
| [apps/missao-saber/src/lib/action.ts](<../../../../apps/missao-saber/src/lib/action.ts>) | confirmação recente do responsável |
| [apps/missao-saber/src/lib/emails.ts](<../../../../apps/missao-saber/src/lib/emails.ts>) | e-mails transacionais |
| [apps/missao-saber/test/billing-lifecycle.integration.ts](<../../../../apps/missao-saber/test/billing-lifecycle.integration.ts>) | regressões de ciclo de vida |
| [apps/missao-saber/e2e/journey.spec.ts](<../../../../apps/missao-saber/e2e/journey.spec.ts>) | jornada com múltiplos perfis |

Novos módulos e artefatos previstos, sujeitos à organização final da implementação:

- Roteiro/harness de homologação Stripe em modo de teste e relatório de evidências.
- Testes de perfis ativos no downgrade e de uso simultâneo.
- Runbook da primeira compra real.

## Integração com a sessão de design

A sessão funcional implementa estados e transições das telas de entrada, planos, Família e seleção de estudante. A sessão de design fornece a apresentação. Valores, nomes e descrições da Stripe continuam humanizados e coerentes com os planos de um/três perfis.

## Validação necessária

- [x] Conta nova e conta Informach existente concluem onboarding sem aprovação editorial e sem duplicação de identidade/família.
- [x] Família confirmado permite três perfis; quarto perfil é recusado no servidor inclusive em criação concorrente.
- [x] Dois dispositivos com perfis diferentes mantêm contexto e progresso próprios.
- [x] Webhook do provedor muda o estado correto; duplicação/reordenação não duplica assinatura nem reativa assinatura encerrada.
- [x] Falha de pagamento e cancelamento alteram acesso conforme a política existente, conservando histórico e exportação; cancelamento agendado não remove antecipadamente o período ativo já pago.
- [x] Downgrade não apaga perfis e respeita a seleção ativa da família.
- [x] OTP/recuperação chegam ao destinatário de teste, com links do app e evento de entrega correlacionado.
- [x] Recursos Stripe e bancos descartáveis usados na homologação são identificados e limpos ao final; produção não recebe cartões ou chaves de teste.

Executar os testes pertinentes sobre a versão que contém a fase e registrar seus resultados. Usar banco descartável para cenários de integração; não modificar dados reais para simular estados de teste. A verificação com provedores da fase 04 e a publicação da fase 06 seguem as condições específicas do plano mestre.

## Review da fase

Revisar a implementação depois dos testes, incluindo caminhos de erro, autorização, concorrência, preservação de dados e consequências didáticas. Conferir também os estados de interface alterados em conjunto com os componentes de design.

Registrar cada achado, sua correção e a verificação correspondente. Não encerrar a fase com defeitos do escopo transferidos silenciosamente para a próxima. Esse review é parte da execução e não exige aprovação editorial da responsável.

O relatório será criado em `evidencias/fase-04.md`, com versão/diff, tarefas entregues, comandos/resultados, achados/correções e limitações. Não registrar revisão automática como revisão humana realizada por Helena.

## Critérios de conclusão

- [x] Jornada Família homologada de ponta a ponta com a Stripe de teste.
- [x] Três estudantes conseguem estudar independentemente e o responsável acompanha todos.
- [x] E-mails críticos validados com evidência de entrega.
- [x] Zero regressões de segregação em Cozya/Agenda e review F4 sem achados pendentes.
- [x] Compra real fica pronta para ser feita pela responsável após a publicação; sua execução não é aprovação editorial nem requisito para encerrar a implementação.

## Entregáveis

- Onboarding e gestão de perfis concluídos.
- Homologação documentada da Stripe e e-mails.
- Jornada multiperfil/multidispositivo verificada.
- Review F4.

Concluídos os critérios e o review, avançar para a [fase 05](fase-05.md).

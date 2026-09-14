# Fase 05: Acompanhamento familiar e correção durante o uso

[Voltar ao plano completo](../PLANO-VERSAO-COMERCIAL.md)

**Estado:** concluída e revisada.  
**Complexidade:** Alta.  
**Dependências:** Fases 01–04 concluídas; tipos de resultado, suspensão e relatórios integrados.

## Objetivo

Permitir que Helena valide o produto enquanto os filhos estudam, com relatos simples e evidências úteis. O fluxo de correção deve ser leve e preservar o histórico, sem reintroduzir aprovações obrigatórias.

## Tarefas de implementação

### F5.1: Simplificar o relato contextual

- [x] Implementar e verificar.

Evoluir o botão de relatar que já existe: categorias como não entendi, acho que há erro, problema na figura e dificuldade no app, com comentário opcional adequado à categoria. Vincular perfil, sessão, atividade e versão no servidor. Preservar limites contra abuso e impedir referência a sessão de outra família.

### F5.2: Organizar a manutenção do conteúdo

- [x] Implementar e verificar.

Evoluir a área administrativa existente para listar relatos por prioridade, recorrência e situação; permitir consultar contexto autorizado, suspender missão, registrar correção e encerrar relato com histórico. A revisão dessa área é uma ferramenta de suporte, não uma etapa pela qual cada atividade precisa passar.

### F5.3: Tratar correções sem distorcer aprendizagem

- [x] Implementar e verificar.

Publicar correções em nova versão e registrar quais evidências foram invalidadas. Aplicar o filtro/reprocessamento de projeções da fase 1 para que erro do app não prejudique o estudante nem atribua domínio indevido. Respostas e snapshots originais continuam imutáveis; não emitir pontos retroativos sem regra documentada.

### F5.4: Tornar o relatório familiar acionável

- [x] Implementar e verificar.

Mostrar o que cada filho fez, o que resolveu sem apoio, onde repetiu dificuldade, quais reflexões registrou e a próxima habilidade recomendada. Distinguir falta de uso, conteúdo ainda não estudado e dificuldade observada. Permitir abrir exemplos pertinentes sem revelar avaliação em andamento.

### F5.5: Implementar painel interno do produto

- [x] Implementar e verificar.

Medir criação da família no Missão Saber, primeiro perfil, primeira missão concluída, retorno na semana seguinte, início de checkout e assinatura confirmada. Preferir fatos já persistidos e eventos no servidor; a conta compartilhada de outro app não conta como novo cadastro deste produto.

### F5.6: Definir métricas e acesso

- [x] Implementar e verificar.

Documentar numeradores/denominadores, deduplicação, fuso America/Sao_Paulo e exclusão de contas técnicas. Para retorno na semana seguinte, usar a janela de dias 7–13 após a primeira missão e apenas coortes que já completaram a janela. Métricas internas são restritas; respostas e caderno permanecem no banco do app, fora do Sentry e de terceiros de analytics. Com uma única família, apresentar contagens e exemplos, sem inferir eficácia pedagógica ou conversão comercial de uma amostra insuficiente.

### F5.7: Concluir o ciclo observado

- [x] Implementar e verificar.

Testar relato feito durante estudo, visualização pela responsável, manutenção, nova versão, retomada e atualização correta do relatório. Preparar roteiro de observação inicial dos filhos, sem sessões obrigatórias de aprovação antes do uso.

## Áreas existentes a modificar

Os caminhos abaixo são pontos de partida da inspeção atual. A implementação deve confirmar o estado dos arquivos e preservar alterações da sessão de design.

| Arquivo | Motivo |
| --- | --- |
| [apps/missao-saber/src/features/learning/actions.ts](<../../../../apps/missao-saber/src/features/learning/actions.ts>) | reportAction existente |
| [apps/missao-saber/src/features/learning/repository.ts](<../../../../apps/missao-saber/src/features/learning/repository.ts>) | saveReport, histórico e evidências |
| [apps/missao-saber/src/features/learning/components/player.tsx](<../../../../apps/missao-saber/src/features/learning/components/player.tsx>) | acesso contextual ao relato |
| [apps/missao-saber/src/features/content-maintenance/repository.ts](<../../../../apps/missao-saber/src/features/content-maintenance/repository.ts>) | fila e resolução atuais |
| [apps/missao-saber/src/features/content-maintenance/service.ts](<../../../../apps/missao-saber/src/features/content-maintenance/service.ts>) | autorização administrativa |
| [apps/missao-saber/src/features/learning/engine.ts](<../../../../apps/missao-saber/src/features/learning/engine.ts>) | agregação semanal e evidências |
| [apps/missao-saber/src/app/(app)/familia/page.tsx](<../../../../apps/missao-saber/src/app/(app)/familia/page.tsx>) | apresentação familiar, em coordenação com design |
| [packages/db/src/schema/missao-saber.ts](<../../../../packages/db/src/schema/missao-saber.ts>) | campos/eventos adicionais gerados por Drizzle |
| [apps/missao-saber/src/lib/telemetry.ts](<../../../../apps/missao-saber/src/lib/telemetry.ts>) | preservar exclusão de conteúdo sensível |

Novos módulos e artefatos previstos, sujeitos à organização final da implementação:

- Projeções e definições de métricas do produto.
- Painel interno restrito e filtros de relatos.
- Migration aditiva para contexto/status/histórico de correção, se necessária.
- Roteiro de observação familiar.

## Integração com a sessão de design

Relatos, cartões do relatório e painel interno usam os componentes da sessão de design. Métricas e contratos de leitura serão definidos antes da composição da tela; não haverá redesign paralelo dessas áreas.

## Validação necessária

- [x] Relato de aluno chega com IDs e versão corretos sem digitação técnica e sem acesso cruzado entre famílias.
- [x] Reenvio e recarregamento não duplicam eventos; limites de abuso continuam eficazes.
- [x] Correção invalida a evidência correspondente, preservando tentativa e snapshot originais.
- [x] Problema de conteúdo não reduz injustamente autonomia nem cria acerto novo em reprocessamento.
- [x] Relatório diferencia resultados objetivos de reflexão, estudo sem pistas e estudo com ajuda.
- [x] Funil usa somente fatos do Missão Saber e coortes elegíveis; troca de perfil e eventos duplicados não multiplicam conversões.
- [x] Conta comum não acessa painel interno nem relatos de terceiros; telemetria não contém respostas/caderno/dados de estudante.
- [x] Relato e manutenção não exigem aprovação para as demais missões continuarem disponíveis.

Executar os testes pertinentes sobre a versão que contém a fase e registrar seus resultados. Usar banco descartável para cenários de integração; não modificar dados reais para simular estados de teste. A verificação com provedores da fase 04 e a publicação da fase 06 seguem as condições específicas do plano mestre.

## Review da fase

Revisar a implementação depois dos testes, incluindo caminhos de erro, autorização, concorrência, preservação de dados e consequências didáticas. Conferir também os estados de interface alterados em conjunto com os componentes de design.

Registrar cada achado, sua correção e a verificação correspondente. Não encerrar a fase com defeitos do escopo transferidos silenciosamente para a próxima. Esse review é parte da execução e não exige aprovação editorial da responsável.

O relatório será criado em `evidencias/fase-05.md`, com versão/diff, tarefas entregues, comandos/resultados, achados/correções e limitações. Não registrar revisão automática como revisão humana realizada por Helena.

## Critérios de conclusão

- [x] Responsável consegue acompanhar três filhos e identificar a próxima ação sem revisar o catálogo inteiro.
- [x] Fluxo relato → correção versionada → retomada demonstrado.
- [x] Painel interno com métricas definidas e testadas, sem falsa validação de aprendizagem ou conversão.
- [x] Review F5 sem achados pendentes.

## Entregáveis

- Relatos contextuais e manutenção simples.
- Relatório familiar ampliado.
- Painel interno de uso/assinatura.
- Métricas documentadas e review F5.

Concluídos os critérios e o review, avançar para a [fase 06](fase-06.md).

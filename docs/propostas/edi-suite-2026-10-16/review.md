# Revisão da proposta da suíte Edi

Registro da revisão do desenho inicial, não do full review de código. A [decisão posterior de distribuição do piloto](distribuicao-piloto.md) substitui os requisitos iniciais de Authenticode, storage, feeds e ativação por API. O [registro de implementação](implementacao.md) separa evidências executadas de homologação pendente.

Revisão consolidada em 16 de outubro de 2026, incorporando publicação e atualização automáticas pelo GitHub, uniformização tecnológica, padrão para novas ferramentas e preservação das interfaces atuais. As correções descritas foram aplicadas à [proposta](proposta.md) e ao [padrão desktop](../../arquitetura-desktop.md).

O escopo é integrar as cinco ferramentas à suíte, com conta, assinatura, licença, segurança e distribuição. Recursos ainda em desenvolvimento serão concluídos posteriormente. A revisão avalia a coerência e a completude da especificação; homologação de dependências e execução dos fluxos comerciais e nativos pertencem à implementação.

## Achados e correções

| ID | Prioridade | Lacuna encontrada | Correção incorporada |
| --- | --- | --- | --- |
| R01 | Alta | O fluxo de publicação não definia o que aconteceria ao subir uma versão ao GitHub | Tags e GitHub Releases Edi iniciam um pipeline comum de checks, build, assinatura, upload e ativação, sem etapa manual repetida |
| R02 | Alta | Não havia regra suficiente para feeds de seis aplicativos no mesmo repositório | Namespace por ferramenta, plataforma, arquitetura e canal; manifesto único e ponteiro ativo transacional |
| R03 | Alta | Publicação parcial, reexecução e versões concluídas fora de ordem estavam indefinidas | Artefatos imutáveis, deduplicação por versão e commit, estados de release e ativação monotônica somente após todos os checks |
| R04 | Alta | Download e instalação dependiam de escolha manual, e a atualização de app fechado estava incompleta | Download automático, instalação no fechamento seguro e manutenção restrita coordenada pelo Hub |
| R05 | Alta | A autenticação desktop ainda deixava em aberto sessão web ou tokens com escopos | OAuth Device Authorization oficial, cliente nativo público, audience Edi, escopos mínimos, rotação e revogação |
| R06 | Alta | O handler de fatura existente pode encerrar o processamento quando não há bônus de IA | Registro de pagamento e período independente de créditos, fatos duráveis e projeção reconstruível de acesso |
| R07 | Alta | Revogação concorrente com emissão e duração de tarefas em andamento não estavam suficientemente delimitadas | Fronteira transacional por titular e dispositivo, vínculo com chave da instalação e janela de preservação limitada |
| R08 | Média | A proposta poderia ser interpretada como requisito de completar os editores ou recriar interfaces | Preservação visual e funcional explícita; backlog incompleto fora do aceite, com recursos pendentes identificados |
| R09 | Alta | Não existia padrão durável para manter as próximas ferramentas uniformes | Documento normativo desktop, instruções em apps/AGENTS.md, scripts comuns e cadastro único de ferramentas |
| R10 | Média | Divergência de Vite havia sido tratada sem distinguir a compatibilidade de electron-vite e do plugin React | Matriz verificada nos registries: electron-vite 6 aceita várias linhas, mas plugin React 6.1.2 exige Vite 8; homologação considera a cadeia completa |
| R11 | Média | A promoção de beta para estável não distinguia canal e versão embutida | Artefato final é testado antes da ativação; mudar de beta para versão final gera novo artefato, sem renomear binário |
| R12 | Média | A disponibilidade de certificados, storage, OAuth e compatibilidade de backend não aparecia como requisito de lançamento | Pré-requisitos com verificação na primeira etapa, contrato de backend antes da ativação e janela de suporte definida |

As prioridades descrevem o impacto da lacuna na especificação anterior. Os itens estão resolvidos no desenho revisado; não representam correções de runtime já implantadas.

## Evidências técnicas relevantes

O [workflow atual](../../../.github/workflows/ci.yml) cobre verificação do monorepo, mas não implementa a distribuição Edi. O novo workflow será criado durante a migração, depois que o catálogo, os aplicativos e o empacotamento estiverem disponíveis.

O [handler de invoice.paid](../../../packages/billing/src/webhooks/invoice.ts) retorna `no_bonus_for_product` quando não há bônus. Essa lógica não pode ser a origem da confirmação necessária para uma licença de produto sem créditos de IA. A extensão de billing deverá preservar o comportamento de créditos e registrar os fatos de acesso separadamente.

O [helper de acesso atual](../../../packages/billing/src/access.ts) filtra status e escopo comercial, sem calcular o prazo de uma autorização offline. A licença Edi acrescentará prazo confirmado, estado do dispositivo e revogações, mantendo a política existente dos demais apps.

As versões candidatas foram consultadas nos registros npm oficiais, e Node LTS na distribuição oficial. Os peers confirmam, entre outros pontos, Vite 8 para o plugin React 6.1.2 e alinhamento de Better Auth 1.7.10 com seu OAuth Provider. A lista e as fontes estão no padrão desktop; instalação, auditoria de vulnerabilidades e compatibilidade integral ainda serão verificadas na homologação.

O GitHub documenta que eventos disparados por `GITHUB_TOKEN` normalmente não iniciam outro workflow. Por isso, a publicação Edi chamará seus jobs e workflows reutilizáveis diretamente. [Documentação oficial de disparo de workflows](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Cobertura dos requisitos

| Requisito | Especificação responsável | Evidência de aceite prevista |
| --- | --- | --- |
| Uma assinatura para a suíte | Proposta, seções 4 e 5 | Uma compra habilita todas as ferramentas disponíveis e não habilita outros produtos |
| Bloquear uso sem assinatura válida | Proposta, seções 5 e 6 | Abertura direta, IPC, MCP e comandos respeitam licença e revogação |
| Preservar interfaces existentes | Proposta, seções 2, 3 e 8; padrão desktop | Baseline e regressão dos recursos já implementados |
| Completar funcionalidades depois | Proposta, seções 2, 14 e 15 | Backlog separado e recursos pendentes identificados |
| Migrar as cinco pastas | Proposta, seção 8 | Snapshot verificável, instalação reproduzível e dados preservados |
| Integrar alterações das origens durante a transição | Proposta, seção 9 | Comparação a três vias e conflitos explícitos antes da integração |
| Priorizar versões recentes, seguras e mantidas | Padrão desktop, seção 2 | Matriz homologada, lockfile e checks dos consumidores afetados |
| Novas ferramentas seguirem o mesmo padrão | Padrão desktop e apps/AGENTS.md | Contratos, scripts, cadastro, testes, licença e release comuns |
| Subir versão ao GitHub e publicar automaticamente | Proposta, seção 7 | Pipeline executado de ponta a ponta por tag ou Release |
| Atualizar instaladores e computadores | Proposta, seção 7 | Downloads refletem a release ativa; clientes baixam e instalam com segurança |
| Falhas não distribuírem pacote incompleto | Proposta, seções 7 e 14 | Falhar qualquer artefato mantém a versão anterior ativa |
| Recuperar trabalho e instalações | Proposta, seções 5, 7 e 8 | Projeto preservado, gravação segura e falhas de instalação recuperáveis |

## Condições conhecidas

- A autorização offline de até 72 horas limita a velocidade do bloqueio remoto; esse prazo continua sendo uma política comercial sugerida.
- Aplicativos antigos distribuídos sem mecanismo de licença não podem ser revogados retroativamente pelo novo servidor.
- Com todos os processos fechados, a instalação automática ocorre na próxima execução da suíte.
- A implementação dependerá dos certificados e serviços de publicação configurados uma vez; os lançamentos rotineiros não dependerão de nova aprovação após o gatilho GitHub.
- Alterações de dados e formatos podem impedir downgrade; a recuperação seguirá a compatibilidade documentada.
- A matriz de versões é candidata à homologação, e a estimativa será recalculada com os resultados da auditoria inicial.

Essas condições fazem parte do contrato proposto e dos testes de aceite. Não são tratadas como funcionalidades já implementadas.

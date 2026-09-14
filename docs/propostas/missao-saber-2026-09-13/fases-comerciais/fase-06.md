# Fase 06: Integração comercial, publicação e full review

[Voltar ao plano completo](../PLANO-VERSAO-COMERCIAL.md)

**Estado:** concluída, revisada e publicada.  
**Complexidade:** Alta.  
**Dependências:** Fases 01–05 concluídas e entrega visual integrada nas telas da versão comercial.

## Objetivo

Entregar a versão completa do recorte definido, pronta para assinatura Família e estudo, sem divulgação. Consolidar os resultados funcionais com o design da outra sessão e verificar a versão efetivamente publicada.

## Tarefas de implementação

### F6.1: Integrar com a sessão de design

- [x] Implementar e verificar.

Conferir os diffs e combinar alterações funcionais/visuais sem sobrescrever trabalho alheio. Validar componentes, estados, teclado, responsividade, textos e assets. Usar a identidade final entregue pela outra sessão no favicon, manifest, imagens dos produtos Stripe e metadados, sem gerar uma segunda identidade.

### F6.2: Concluir a apresentação comercial

- [x] Implementar e verificar.

Apresentar conteúdo e faixa escolar realmente disponíveis, preços, recorrência mensal/anual, limites de perfis, amostra gratuita e o que a assinatura inclui. Atualizar mensagens de piloto/em revisão quando não correspondam ao produto final; manter a preparação independente e evitar alegações de eficácia ainda não observada. Nomes e descrições de produto sem travessão.

### F6.3: Fechar informações operacionais

- [x] Implementar e verificar.

Conferir termos, privacidade, contato de suporte, canal de cancelamento/reembolso e retenção com o funcionamento implementado. Consultar fontes oficiais atuais na implementação dos requisitos aplicáveis; utilizar dados reais da empresa e não inventar política, endereço ou parecer jurídico. Atualizar documentação dos provedores e operação da fila compartilhada.

### F6.4: Consolidar repositório e checks

- [x] Implementar e verificar.

Registrar commits por unidade coerente sem incluir segredos, backups, PDFs de referência ou alterações não revisadas da outra sessão. Ajustar o escopo de lint para artefatos gerados/pesquisa quando apropriado e corrigir os diagnósticos do código comercial. Rodar também o check global e registrar fielmente a dívida remanescente fora do escopo; não apresentar check focado como aprovação do monorepo inteiro.

### F6.5: Executar full review e ensaio de publicação

- [x] Implementar e verificar.

Rever a integração inteira: disponibilidade, novos formatos, autoria, avaliações, perfis, cobrança, e-mails, relatos, métricas e design integrado. Aplicar migrations geradas em cópia descartável, testar preservação de dados e compatibilidade. Definir rollback de código compatível com snapshots novos; não assumir que binário antigo consegue interpretar tipos novos. Corrigir os achados antes do deploy; repetir os testes afetados e a revisão dos ajustes.

### F6.6: Publicar a versão comercial

- [x] Implementar e verificar.

Confirmar backup, aplicar migrations aditivas em executor único, publicar serviços dependentes quando necessário e subir o Missão Saber. Manter Stripe real em produção, teste no local, chaves server-side e proxy Cloudflare conforme o ambiente atual. Preservar a escolha de não divulgar; manter noindex enquanto essa for a orientação, reconhecendo que isso não é controle de acesso.

### F6.7: Verificar produção e entregar operação

- [x] Implementar e verificar.

Conferir a URL pública, versão implantada, banco/Redis, e-mails, imagens/nomes/preços Stripe, assinatura inválida/válida/deduplicação de webhook, manutenção agendada e captura Sentry. Entregar relatório por fase, full review, changelog, catálogo publicado e roteiro curto para Helena comprar o Família e iniciar os três perfis. A primeira cobrança real é feita pela responsável na interface.

## Áreas existentes a modificar

Os caminhos abaixo são pontos de partida da inspeção atual. A implementação deve confirmar o estado dos arquivos e preservar alterações da sessão de design.

| Arquivo | Motivo |
| --- | --- |
| [apps/missao-saber/src/app/page.tsx](<../../../../apps/missao-saber/src/app/page.tsx>) | apresentação e oferta, em coordenação com design |
| [apps/missao-saber/src/app/termos/page.tsx](<../../../../apps/missao-saber/src/app/termos/page.tsx>) | informações comerciais reais |
| [apps/missao-saber/src/app/privacidade/page.tsx](<../../../../apps/missao-saber/src/app/privacidade/page.tsx>) | tratamento e retenção informados |
| [apps/missao-saber/src/app/layout.tsx](<../../../../apps/missao-saber/src/app/layout.tsx>) | metadata, robots e assets da identidade final |
| [apps/missao-saber/scripts/stripe-branding.mjs](<../../../../apps/missao-saber/scripts/stripe-branding.mjs>) | imagem/nome/descrição nos dois modos |
| [apps/missao-saber/scripts/production-smoke.mjs](<../../../../apps/missao-saber/scripts/production-smoke.mjs>) | verificação pós-deploy |
| [apps/missao-saber/scripts/production.py](<../../../../apps/missao-saber/scripts/production.py>) | configuração dos serviços |
| [apps/missao-saber/PRODUCAO.md](<../../../../apps/missao-saber/PRODUCAO.md>) | runbook final |
| [biome.json](<../../../../biome.json>) | escopo correto dos checks, sem suprimir defeitos |
| [docs/deploy-runbook.md](<../../../../docs/deploy-runbook.md>) | convenções da operação compartilhada |

Novos módulos e artefatos previstos, sujeitos à organização final da implementação:

- Relatórios de implementação/review das seis fases e full review comercial.
- Inventário e versão final do catálogo.
- Changelog e registro de deployment.
- Roteiro da primeira compra e estudo em família.

## Integração com a sessão de design

O full review e os testes de produção cobrem o design efetivamente integrado. Eventuais mudanças visuais posteriores que afetem interação, nomes, textos ou assets exigem uma nova verificação do fluxo afetado; não refazer o trabalho visual por conta própria.

## Validação necessária

- [x] Build, typecheck e testes de unidade/integração das áreas alteradas e dos contratos compartilhados aprovados na versão combinada.
- [x] Desktop/celular: demonstração → conta → Família → três perfis → formatos diferentes → revisão → relato → relatório.
- [x] Compra/Portal/falha/renovação/cancelamento homologados em teste e configuração real verificada sem cobrar automaticamente a responsável.
- [x] Usuário administrativo, conta comum, assinatura gratuita e paga respeitam suas permissões, inclusive em URLs diretas.
- [x] Atualização preserva perfis, snapshots, progresso e assinatura; estratégia de rollback validada com versões de conteúdo novas.
- [x] Aplicação, cron e provedores respondem após deploy; captura Sentry é verificada com evento controlado, sem expor respostas ou dados de estudantes.
- [x] Favicon e imagens Stripe correspondem à identidade final da outra sessão; links e preços estão coerentes em teste/produção.
- [x] Nenhuma campanha, convite a terceiros ou divulgação automática é disparada.

Executar os testes pertinentes sobre a versão que contém a fase e registrar seus resultados. Usar banco descartável para cenários de integração; não modificar dados reais para simular estados de teste. A verificação com provedores da fase 04 e a publicação da fase 06 seguem as condições específicas do plano mestre.

## Review da fase

Revisar a implementação depois dos testes, incluindo caminhos de erro, autorização, concorrência, preservação de dados e consequências didáticas. Conferir também os estados de interface alterados em conjunto com os componentes de design.

Registrar cada achado, sua correção e a verificação correspondente. Não encerrar a fase com defeitos do escopo transferidos silenciosamente para a próxima. Esse review é parte da execução e não exige aprovação editorial da responsável.

O relatório será criado em `evidencias/fase-06.md`, com versão/diff, tarefas entregues, comandos/resultados, achados/correções e limitações. Não registrar revisão automática como revisão humana realizada por Helena.

## Critérios de conclusão

- [x] Todos os critérios de conclusão da versão comercial do plano mestre atendidos.
- [x] Review de cada fase e full review sem defeitos conhecidos pendentes no escopo.
- [x] Deployment saudável e smoke documentado contra a versão realmente publicada.
- [x] Helena consegue contratar Família e iniciar o estudo sem aprovar conteúdo.
- [x] Relatório final distingue validação de software realizada da validação didática que ocorrerá durante o uso dos filhos.
- [x] Dívida global externa e dependências comerciais factuais, se houver, identificadas explicitamente, sem declaração de conclusão fictícia.

## Entregáveis

- Versão comercial publicada e integrada ao design.
- Documentação operacional e comercial atualizada.
- Reviews, evidências e relatório final.
- Roteiro de compra Família e início dos estudos.

Após a verificação de produção, entregar o relatório final e o roteiro da primeira compra. A responsável fará a compra real pela interface.

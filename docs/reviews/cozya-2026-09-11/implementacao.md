# Implementação aprovada — Cozya

Autorização: corrigir R01–R15 e implementar o núcleo da proposta. Preços fixados pelo usuário: **R$ 14,90/mês e R$ 149/ano**, com 50 créditos mensais do Pro. Nenhuma alteração dos Price IDs do Stripe.

**Revisão posterior da entrega:** [review completo da implementação](review-da-implementacao.md), com correções adicionais, análise de compatibilidade dos pagamentos e verificação atualizada. As evidências abaixo registram a primeira implementação; o novo review registra a rodada mais recente.

## Escopo e acompanhamento

- [x] R01: detalhe atualizado após editar, inclusive compartilhar e editar novamente.
- [x] R02: captura de voz com uma reserva e um crédito pela tarefa completa.
- [x] R03: remover memória implícita e conteúdo dos logs; limpeza e política verificáveis.
- [x] R04: demonstração de 3 operações de IA e 14 dias do fluxo semanal, sem cartão, por conta verificada.
- [x] R05: preservar fonte, comunicar revisão e incerteza sem garantias culinárias.
- [x] R06: erros distinguíveis, limite de corpo real, recuperação de rede e saldo.
- [x] R07: contraste, descrição acessível, redução de movimento e área de toque.
- [x] R08: fixtures, expectativas e avaliação de IA que falha quando incompleta.
- [x] R09: adaptação com revisão antes de salvar.
- [x] R10: porções e ingredientes estruturados; planejamento e compras com quantidades compatíveis.
- [x] R11: página de preparo, progresso, temporizador, proteção de rascunho e entrada da PWA.
- [x] R12: eventos de ativação e uso semanal sem conteúdo de receitas.
- [x] R13: perfil explícito, exportação e exclusão encontráveis.
- [x] R14: CSP aplicada, contratos operacionais e documentação de custo corrigidos.
- [x] R15: E2E de autenticação e jornadas reais, isolamento e concorrência.
- [x] Coleção inicial autoral com indicação de revisão pendente; repetir semana e receita cozinhada.
- [x] Build geral: os quatro apps concluíram a compilação de produção. Migrations locais, checks, tipos e testes concluídos.

O piloto com famílias, validação culinária humana e publicação em produção dependem de execução operacional real. Não serão apresentados como resultados de testes de software. Offline completo, colaboração simultânea, catálogo extenso, vídeos sociais e nutrição clínica continuam fora do primeiro ciclo, conforme a proposta.

## Direção da interface

Pessoa: quem organiza jantares e marmitas de uma casa de 2–4 pessoas. A ação principal é decidir o próximo preparo e sair com uma lista utilizável.

Domínio: caderno, semana, panela, porções, compras, sobras e marmita. Paleta do domínio: laranja da marca, tinta azul-marinho, papel creme, verde de ingredientes e vermelho de tomate. Aplicar os tokens existentes; verde/vermelho somente com significado de estado. Assinatura: a semana à mesa, ligando cada dia à receita e à compra correspondente.

Trocar o painel de contagens por tarefas da semana; navegação compacta por Receitas, Semana e Compras; vazio com primeira ação e receitas iniciais. Manter Plus Jakarta Sans, espaçamento de 4 px, superfícies de temperatura uniforme, bordas discretas, controles grandes e tipografia legível durante o preparo.

Para os componentes de semana, compras, preparo, perfil e adaptação: a intenção é concluir a tarefa sem perder dados; laranja com texto marinho orienta a ação; bordas e variações suaves de superfície agrupam conteúdo; a fonte existente mantém continuidade; espaçamentos em múltiplos de 4 px. Verificar estados de carregamento, vazio, erro, foco e teclado no navegador.

## Evidências

Implementado no workspace em 11/09/2026, sem deploy ou alteração de configuração de preços. Os achados históricos continuam em `review-tecnico.md`; esta página registra o resultado da implementação.

### O que a pessoa consegue fazer

- Entrar sem escolher plano, ativar 14 dias de cozinha e 3 créditos de IA, revisar uma receita própria ou uma das quatro ideias autorais iniciais.
- Montar a semana com receitas, refeições repetidas ou texto livre, indicar porções e gerar compras por categoria.
- Somar quantidades compatíveis, marcar o que já tem/comprou e acrescentar itens. Regenerar preserva marcações quando as quantidades não mudaram; medidas incompatíveis e rendimento desconhecido pedem conferência.
- Cozinhar numa página própria, ajustar porções sem IA, marcar ingredientes/passos, retomar o timer/progresso, manter a tela ligada quando suportado, declarar preparo concluído e repetir a semana.
- Adaptar uma receita com IA, revisar e salvar cópia; recuperar resultados recentes sem chamar o modelo novamente; exportar e limpar os dados nas configurações.

### Evidência por achado

| Achado | Implementação e evidência |
| --- | --- |
| R01 | Cache de detalhe acompanha versão e é invalidado ao salvar. E2E reproduz editar 2 → 3 ovos, abrir, conferir WhatsApp e editar novamente sem recarga. |
| R02 | `/api/ai/recipes/from-audio` reserva uma vez a captura completa. Testes exercitam sucesso e falha parcial com o wrapper real de créditos; pesquisa + extração usam o mesmo saldo reservado. |
| R03 | Mastra sem memória/storage/traces de conteúdo, logger interno desativado. Teste com modelo real confirmou zero threads; teste PostgreSQL removeu thread/mensagens culinárias legadas e preservou outra aplicação. Retenção e política alinhadas; ativação da rotina em produção é pendência operacional. |
| R04 | Ativação explícita por e-mail verificado, HMAC de uso prévio, concessão idempotente de 3 créditos com validade de 14 dias, limites de tentativa individual/global. Oito ativações simultâneas concederam só 3 créditos. |
| R05 | Fonte/atribuição/rendimento/tempo preservados quando conhecidos; fonte de busca precisa existir nas citações reais. Removidas afirmações de popularidade e precisão não comprovadas. |
| R06 | Erros de saldo/tamanho/limite/timeout distintos; input e chave preservados após queda de rede, replay por 24h, recuperação em página própria, compensação idempotente se a resposta falhar após débito. Teste real também revelou e corrigiu JSON não serializado no SQL de liberação de reservas do billing compartilhado. |
| R07 | Contraste medido de 5,71:1 no botão principal (antes 2,63:1), altura de 48px, controles do cabeçalho e ações com área ampliada, descrição dos diálogos, foco de teclado e redução de movimento. Temas claro/escuro conferidos em 390×844, sem transbordamento horizontal nas telas verificadas. |
| R08 | 22 casos e 5 fixtures sintéticas autorais; baseline real com hashes; runner reprova conjunto incompleto e divergências críticas de medidas. Busca entregou 1/2 consultas e recusou 1 com segurança. Fotos manuscritas reais, áudio real e revisão culinária humana ainda fazem parte do piloto, não foram substituídos por estes testes. |
| R09 | Ação de adaptação na página de preparo, custo explícito, comparação e revisão antes de salvar uma cópia. Pedido vago e rendimento ausente não autorizam invenção de medidas. |
| R10 | Schema aditivo, rendimento/tempo anuláveis e ingredientes estruturados sem destruir texto legado. Dez testes de unidades/consolidação e integração de compras para refeições de várias porções. |
| R11 | Página de preparo com progresso persistido, timer por prazo absoluto e inicialização compatível com renderização do servidor. E2E confirmou recarga e retomada. Saída durante permissão/gravação encerra microfone sem chamada paga. Rascunhos pedem confirmação ao fechar; PWA entra em `/dashboard`. |
| R12 | Eventos deduplicados de receita, plano, compras, preparo, repetição e oferta; métricas agregadas com funil em 7 dias, casas com 3 preparos e cobertura de custo real. SQL das métricas exercitado no PostgreSQL. Não são números de clientes reais. |
| R13 | Perfil explícito/editável, exportação JSON e limpeza do app verificadas por E2E. Exclusão da conta Informach tem escopo compartilhado visível, confirmação por e-mail, bloqueio se outros apps têm assinaturas e limpeza obrigatória antes de concluir. Fluxo externo completo de e-mail/Stripe precisa do ensaio de homologação. |
| R14 | CSP aplicada por padrão, limites reais de corpo e de execução, custo reportado pelo gateway registrado em vez de margem inventada. Runbook documenta jobs, retenção, backups e validação de billing antes de publicar. |
| R15 | E2E OTP verifica logout/sessão; jornada móvel completa e cancelamento do microfone; testes reais de isolamento/concorrência/ledger. CI inclui migrations Drizzle + Mastra, integração e preflight de eval sem chamadas pagas. |

### Verificações executadas

Todas em ambiente local, sem pagamentos, mensagens ou alterações em produção. Chaves reais de modelo usadas somente nas avaliações opt-in; Stripe fictício e e-mail sandbox nas demais suítes.

| Verificação | Resultado da última execução relevante |
| --- | --- |
| Migrations 0032 e 0033 | Geradas por Drizzle e aplicadas localmente; schema exercitado pelos testes de integração |
| `pnpm check` | PASS, 801 arquivos; formatação e lint sem erros |
| `pnpm typecheck` | PASS, 11 pacotes; 7 resultados de cache válido e 4 reexecutados após mudanças compartilhadas |
| `pnpm exec turbo test --concurrency=1` | PASS, 1.109 testes em 97 arquivos: Cozya 80, billing 175, ai-core 71, auth 216, emails 106 e Agenda da Turma 461; 3 pacotes reexecutados e 3 caches válidos da mesma sessão |
| `pnpm --filter @informach/cozya test:integration` | PASS, 12 testes PostgreSQL, incluindo limite Free concorrente, isolamento, compras, preparo, replay, compensação única, liberação imediata de reserva e exclusão legada |
| `COZYA_LIVE_AI_SMOKE=1` + integração | PASS, serviço real/Mastra/OpenRouter/ledger: débito único, replay, recusa sem débito, custo real e nenhuma conversa criada; [evidência](evidence/ai-service-smoke.json) |
| `pnpm --filter @informach/cozya e2e` | PASS, 4 testes Chromium em 54s: OTP, ciclo de cozinha e saída do microfone |
| `EVAL_PREFLIGHT=1` + eval | PASS, 22 casos e 5 imagens encontrados; zero chamadas |
| `EVAL_SNAPSHOT=1` + eval | PASS nos 22 critérios por caso; 1/2 buscas entregues, 1 recusa segura. [Metadados e custo reportado](evidence/eval-summary.json) |
| `pnpm exec turbo build --concurrency=1` | PASS, os 4 apps: Cozya, admin, site e Agenda da Turma; sem cache, em 3min33s |
| `git diff --check` | PASS; apenas avisos de conversão LF/CRLF do ambiente Windows |

O primeiro build geral completou Cozya, admin e site, mas parou na proteção HTTPS do Agenda da Turma porque a verificação havia herdado URLs locais HTTP. A execução final passou nos quatro apps com URLs HTTPS fictícias apenas no processo de build, preservando os arquivos de ambiente.

A execução inicial simultânea de todos os testes com typecheck causou timeouts de importação sob carga. Executar os pacotes em sequência resolveu essa competição. Quatro testes do Agenda da Turma dependiam de datas vencidas; o relógio dos testes foi fixado em maio de 2026, sem mudar a regra de negócio daquele app nem remover assertions.

Os testes reais também impediram encerrar prematuramente: revelaram a reserva que não era liberada por serialização JSON, conteúdo impresso pelo logger debug do Mastra e uma divergência de hidratação do temporizador. As causas foram corrigidas e os cenários executados novamente.

### Telas verificadas

- [Compras no celular](evidence/kitchen-shopping-mobile.png).
- [Preparo em tema claro](evidence/kitchen-cooking-mobile.png).
- [Preparo em tema escuro](evidence/kitchen-cooking-dark-mobile.png).
- [Medição de contraste e tamanho](evidence/ui-measurements.json).

Imagens capturadas no servidor de desenvolvimento; o indicador “N” pertence ao Next.js local. As capturas foram inspecionadas visualmente.

### Limites e próxima execução

Preços e Price IDs permanecem idênticos em `packages/config/src/products.ts`. A evolução altera utilidade e acesso de demonstração, sem aumento de preço.

Não houve deploy, criação de cron em produção, campanha, recrutamento, validação de reconhecimento de áudios reais, preparo culinário humano ou comprovação de disposição a pagar. Os passos para essas verificações e o piloto com 30 casas estão em [operação e piloto](operacao-e-piloto.md). URL, compartilhamento público com botão de salvar, indicação e parcerias continuam decisões posteriores de aquisição; a jornada semanal aprovada está implementada.

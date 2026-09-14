# Missão Saber: relatório da versão comercial

Data: 13/09/2026. Aplicação: https://missao-saber.informach.com.br.

## Resultado

As seis fases do plano comercial foram implementadas. O Missão Saber está pronto para assinatura e para o teste familiar, sem campanha ou divulgação. A responsável pode contratar o plano Família, criar até três perfis e acompanhar cada estudante. O sistema não possui aprovação editorial: o catálogo fica disponível conforme a assinatura e a manutenção atua somente quando aparece um problema real.

O recorte entregue atende 6º e 7º ano com OLITEF N1, Canguru E, Canguru B e OBMEP N1. Os materiais oficiais serviram apenas para mapear competências, estilos de raciocínio e dificuldade. Enunciados, valores, imagens, soluções, pistas e alternativas do produto são autorais.

## Implementação por fase

| Fase | Resultado entregue |
| --- | --- |
| 01. Catálogo direto | Remoção do fluxo de publicação/aprovação, exclusão da tabela `releases` e disponibilidade controlada somente por assinatura, faixa escolar e suspensão operacional. |
| 02. Motor didático | Quatro formatos de atividade, explicação antes da prática, pistas graduais, feedback por erro, reflexões sem nota automática, revisão espaçada e laboratórios manipuláveis. |
| 03. Conteúdo comercial | 61 missões, 604 atividades únicas, 96 itens reservados em oito bancos e 37 desafios de justificativa; progressão e pré-requisitos para quatro trilhas. |
| 04. Família e cobrança | Conta responsável, até três perfis, isolamento de progresso, checkout, Portal, upgrade, downgrade com perfil retido, renovação, inadimplência, cancelamento e exportação. |
| 05. Observação e manutenção | Relatos contextualizados, pausa/correção/reativação por versão, preservação de snapshots, relatórios familiares e métricas internas sem respostas de estudantes. |
| 06. Produção | Railway, PostgreSQL, Redis, Stripe, SendGrid, Sentry, cron, domínio Cloudflare, backup restaurado, migrations, smoke público e runbook. |

## Experiência de aprendizagem

O estudante recebe uma próxima missão curta com base no percurso, no que já tentou e nas revisões vencidas. Uma missão alterna descoberta, exemplo, tentativa apoiada, aplicação independente e reflexão. Pistas ficam registradas, e o domínio exige variedade de problemas, dias distintos e respostas independentes. Reflexões contam para concluir a experiência, mas não se transformam em acerto ou evidência de autonomia.

Diagnósticos e simulados usam bancos reservados e escondem a correção até o final. A manutenção consulta a identidade e a versão persistidas no snapshot, inclusive depois que o catálogo avança, para impedir o uso de uma atividade suspensa. O histórico, o caderno e a exportação permanecem disponíveis após cancelamento, conforme a política do produto.

## Produto e operação

| Plano | Preço | Perfis |
| --- | --- | --- |
| Individual | R$ 29,90/mês ou R$ 299/ano | 1 |
| Família | R$ 44,90/mês ou R$ 449/ano | até 3 |

Stripe possui produtos, preços, Portal e webhook nos modos teste e produção. Os produtos exibem os nomes “Missão Saber Individual” e “Missão Saber Família”, descrições em linguagem natural e a imagem atual do app. O Portal cuida de pagamento, faturas e cancelamento; mudanças de plano ficam no app para aplicar as regras de prorrateio e de capacidade.

SendGrid usa a fila compartilhada com os outros apps. Um evento `processed` registra aceitação; somente `delivered` confirma entrega. Sentry recebe erros sanitizados; PostgreSQL e Redis participam do readiness; o cron percorre reconciliação, inadimplência e filas sob locks distribuídos. A antiga arquitetura editorial não aparece em schema, configuração ou navegação.

## Reviews e correções

Cada fase passou por review, correção e nova verificação. O full review comercial da rodada 013 encontrou cinco problemas: reflexões impediam conclusão de missão, alternativas de simulados revelavam a resposta por padrão textual, troca sobre downgrade agendado mantinha cancelamento remoto, avaliações antigas perdiam a origem de suspensão e `processed` do SendGrid era tratado como entrega. A revisão complementar 014 encontrou dois casos de recuperação: repetir com segurança uma alteração de plano não confirmada e impedir reenvio após aceitação do SendGrid acompanhada de erro tardio. Todos foram corrigidos.

A correção financeira permite repetir exatamente uma alteração agendada que não foi confirmada e exige desfazê-la antes de escolher outro plano. A correção didática mantém participação e evidência objetiva como conceitos separados. Os 96 itens reservados são matematicamente distintos sem depender da numeração visual; diagnóstico e simulado compartilham 26 famílias semânticas reais, e a segunda exposição é identificada como prática. O hash de snapshots passou a ser canônico para sobreviver à ordenação de chaves do JSONB. Aceitação e estados terminais de e-mail ficaram protegidos contra retries, falhas e eventos atrasados.

As rodadas 011, 013 e 014 estão com zero achados pendentes. O relatório consolidado do revisor independente está em `.compozy/tasks/missao-saber/reviews/commercial-final-verification.md`.

No smoke operacional posterior, Cozya e Agenda ainda iniciavam com `next start` apesar do build standalone. A configuração foi corrigida para empacotar assets públicos, escutar na interface de rede da Railway e criar a conexão Redis somente no runtime. Os novos deployments passaram no healthcheck e serviram página, manifest e JavaScript sem erro ou resposta 5xx.

## Evidências finais

- Missão Saber: 73 testes unitários e 47 testes de integração com PostgreSQL aprovados.
- Billing: 199 testes aprovados; homologação real com Stripe de teste (`runId fb4707d4-453e-4444-bf90-ea31b7e25ac6`) cobriu checkout, Portal, reativação, upgrade, downgrade, renovação, falha e cancelamento.
- E-mail: 112 testes aprovados; cadastro, login por OTP e recuperação concluídos com eventos `delivered`, aceitação e IDs do SendGrid.
- Cozya e Agenda da Turma: 86 e 506 testes, typechecks, builds standalone e smokes aprovados após a atualização compartilhada de e-mail e Redis.
- Navegador: 6 jornadas E2E aprovadas em desktop e celular.
- Produção: 1.265 testes na suíte raiz, typecheck dos 12 pacotes, migrations, readiness, assets, rotas protegidas, webhook Stripe e cron autenticado aprovados no deployment `b7aa6d9e-26f1-4b20-8b95-2a5c10a07815`.
- Recuperação: backup `109e5c1e-d8a4-4c76-82ad-3129e3d3cb7f` e restauração descartável verificados antes das migrations comerciais.

O check global do monorepo continua reprovado por dívida preexistente e arquivos brutos do acervo. Os arquivos relevantes desta entrega passaram no Biome. Essa dívida não altera os builds, testes ou o smoke desta versão, mas deve ser tratada como manutenção separada do repositório.

## Próxima etapa

A próxima etapa é operacional e didática: a responsável entra com `helena@informach.com.br`, confirma o e-mail, contrata Família e cria os perfis dos filhos. O roteiro de observação registra compreensão, uso de pistas, explicação da estratégia, transferência para um problema novo, retorno semanal e leitura do relatório familiar.

Esse uso validará eficácia didática, retenção e disposição a pagar. Ajustes de conteúdo serão feitos a partir de relatos e comportamento observado, pausando somente a unidade afetada quando necessário. A expansão para outros anos, níveis, escolas, offline e tutoria por IA permanece no roadmap posterior.

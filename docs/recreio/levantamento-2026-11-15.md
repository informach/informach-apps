# Recreio e Morada: levantamento para produção

Registro histórico do início de 15/11; a execução posterior está no [estado atual](../estado-do-repositorio.md) e no [registro de evidências](execucao-2026-11-15.md). O titular confirmou depois que a [licença de compra permite o uso comercial da arte](licenciamento-arte.md); a autorização avulsa mencionada abaixo deixou de ser pendência. Exposição de fontes no histórico é assunto distinto.

Levantamento de 15/11/2026, sobre a `main` de `informach-apps` em `8602e4023b49e9daeb8883af554e1d26351969ce`, igual à `origin/main` consultada. Propostas consultadas diretamente na `origin/main` do repositório privado `artes-3d`, em `061177f12f603c74c32c9ddc2b81e6eb0b040565`: [Recreio v2.2](https://github.com/informach/artes-3d/blob/061177f12f603c74c32c9ddc2b81e6eb0b040565/paginas/recreio.html) e [Morada v4.4](https://github.com/informach/artes-3d/blob/061177f12f603c74c32c9ddc2b81e6eb0b040565/paginas/morada.html). O clone local da arte está atrasado; as duas propostas coincidem com as versões remotas, conferidas por diff.

**Conclusão:** existe uma fundação técnica substancial e testável para um alfa interno de adultos. O Recreio ainda não é a plataforma familiar/comercial descrita na proposta e não está executando em produção. O próximo avanço exige corrigir integridade e operação, concluir X4 e seguir a sequência de diversão do Morada, proteção familiar, beta e lançamento. Ativar os serviços ou cadastrar preços no Stripe não encerra essas frentes.

Este levantamento não altera aplicação, infraestrutura, cobrança, permissões ou histórico Git. Resultados anteriores permanecem nos [registros de implementação](implementacao.md), [review da base](review-2026-11-13.md) e [review D1](review-d1-2026-11-13.md). As verificações abaixo são desta sessão; evidências históricas estão identificadas como tais.

## 1. O que já foi construído

| Área | Implementado | Limite atual |
| --- | --- | --- |
| Estrutura | Portal Next, domínio `@informach/recreio`, simulação pura, servidor Node e cliente Three.js/HUD React separados; catálogo central | Não é necessário trocar a arquitetura ou o provedor para continuar |
| Conta | Cadastro, confirmação de e-mail, senha/OTP, recuperação, entrada e saída; integração com autenticação compartilhada | Identidade adulta é atribuída ao criar o perfil, sem verificação etária implementada |
| Perfil e aparelho | Perfil próprio, apelido/avatar, seleção no servidor e sessão de aparelho persistida | Só o próprio perfil adulto; não há grupo familiar utilizável, convite de adulto ou pareamento infantil |
| Acesso | Decisão central `avaliarAcesso`/`decidirAcesso`, cobertura por plano e concessão auditada; scripts de concessão/revogação | Acesso efetivo do alfa vem de concessões; não há jornada comercial |
| SDK | Ingresso Ed25519 de 60 s e uso único, JWKS, sessão de 15 min, renovação e sessão única por perfil | Sem dados privados de perfil com revisão, conquistas, amizades ou presença social da plataforma |
| Mundos | Criar, listar, abrir, listar membros e aceitar convite de uso único/24 h; IDs e escopos conferidos | Convite só do responsável e só de membro; sem visitas, sucessão, saída, expulsão e gestão completa |
| Execução | Posse exclusiva com cerca transacional no Postgres; batimento, drenagem, hibernação e retomada | Uma réplica do Morada e uma origem WebSocket por jogo; não equivale a alta disponibilidade |
| Persistência | Fotografia comprimida, diário ordenado/idempotente, limite de tamanho e retenção de cinco fotografias comuns | Bytes no Postgres, sem adapter de bucket; recuperação de corrupção e restauração operacional incompletas |
| Morada | Família pronta, moradores autônomos, necessidades, reservas, relações, casamento, gravidez, nascimento, cuidados, envelhecimento e regras de tempo | Núcleo e prova jogável; criar família, construir/comprar, ampliar interações e som continuam abertos |
| Arte | Empacotador privado, hashes/brotli, carregamento sob demanda, corpos, móveis e acabamentos; fallback procedural | Arte não instalada no Railway; FPS em hardware representativo ainda sem homologação |
| Operação | Health/readiness, manutenção, logs filtrados, Sentry preparado, contagens e auditoria no Bastidores, CI e E2E | Falta operação real, alertas ensaiados, restauração, custo e capacidade homologados |

Fontes principais: [guia do portal](../../apps/recreio/CLAUDE.md), [SDK/domínio](../../packages/recreio/README.md), [servidor](../../apps/morada-server/README.md), [simulação](../../packages/morada-sim/README.md), [cliente](../../packages/jogo-morada/README.md) e [catálogo](../../packages/config/src/jogos.ts).

Há escolhas adequadas que devem ser preservadas: jogo sem conexão ao banco, autorização no servidor, isolamento entre conta/perfil/membro, fatos críticos persistidos antes da resposta, simulação determinística e arte fora do checkout público. As lacunas abaixo não justificam uma reescrita.

## 2. Correspondência com a proposta

Os identificadores P0–P7 são lotes locais de implementação; não significam que todos os requisitos prioritários P0 da proposta estejam concluídos.

| Etapa aprovada na proposta | Situação verificada | O que ainda impede o aceite |
| --- | --- | --- |
| 1 — Prova juntos / Marco 0 | P0–P7, J0–J8 e X1–X3 registrados como implementados; prova local de duas contas, queda e recuperação existe | X4: execução fechada no Railway, transportes reais, custo com 1/2/4/8 pessoas e correções de integridade deste levantamento |
| 2 — A diversão | D1 implementado para a casa atual, com limites de desempenho registrados | D2–D8: criar família; construir/comprar; 20–30 interações com animação; família completa; ciclo dos mundos; som; teste de sete dias de jogo e vontade de voltar |
| 3 — Jogar junto com segurança / Marco 1 | Infraestrutura de perfis, convites e permissões oferece uma base | Grupo familiar real, adulto com login próprio no grupo, menores, pareamento, PIN/passkey, políticas versionadas, visitas, supervisão, bloqueio e denúncia |
| 4 — Beta / Marco 2 | Catálogo de produtos e leitura do billing estão preparados | Experimento de teste, custo/margem por plano, cobrança em teste e conciliação; trabalho/escola/serviços/conteúdo do Morada previstos para essa etapa |
| 5 — Lançamento / Marco 3 | Runbooks e suporte indicado nas telas | Cobrança real homologada, termos/classificação/licenças, operação/moderação, exportação/exclusão e restauração comprovadas; família externa completa a jornada sem ajuda |

O jogo de teste existente prova ingresso/mundo/posse. Ele não substitui o segundo jogo 2D sem mundos, com dados de perfil e conquistas, previsto para depois do beta. Offline, desktop, TV/controle e expansão do catálogo permanecem posteriores; não precisam bloquear o primeiro lançamento web previsto.

## 3. Estado de produção conferido nesta sessão

Leituras pelo plugin Railway, sem operações de escrita, no projeto `informach-apps`, ambiente `production`. Consulta aproximadamente às 05h de 15/11, horário de Brasília.

| Item | Estado atual | Consequência |
| --- | --- | --- |
| Portal Recreio | Serviço existe, sem fonte e sem deployment | Aplicação ainda não executou no Railway |
| Morada | Serviço existe, sem fonte e sem deployment; uma réplica declarada | Nenhuma instância de jogo em produção |
| Manutenção | Cron de cinco minutos existe, sem fonte/imagem e sem deployment | Não há evidência de execução da manutenção |
| Volume de arte | Volume de 1.000 MB ligado a `/data` | Existência confirmada; conteúdo não inspecionado nesta sessão. A configuração não contém `MORADA_ARTE_DIR`; o último registro informa que não houve transferência |
| Variáveis do portal | 19 nomes, sem `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` | O validador exige ambos em produção; o build/start permanece bloqueado por configuração |
| Arte pública do jogo | Não há configuração de pasta no servidor; a IaC declara apenas `ws`, sem origem `assets` | Só ligar os serviços não entrega o visual D1 |
| Domínio Recreio | Railway: propriedade verificada e certificado válido. DNS público resolve para Cloudflare | HTTPS alcança o edge, mas `/api/health` responde 404 com `x-railway-fallback: true`, consistente com ausência de deploy |
| Domínio Morada | Propriedade não verificada, certificado aguardando validação; consulta DNS local retorna nome inexistente | WebSocket público ainda não é alcançável |
| Migrator compartilhado | Último deployment: `SUCCESS`, criado em 14/11 às 13:18 UTC | O registro de `CRASHED` em 13/11 é histórico. Sucesso de deployment não comprova, sozinho, todas as migrations ou readiness do Recreio |
| Postgres/Redis | Últimos deployments constam como `SUCCESS` | Não houve conexão do Recreio a esses serviços nesta sessão, nem teste de transporte real do app |

O Railway ainda pede atualização do CNAME do Recreio, mas o domínio resolve pelo proxy Cloudflare e tem certificado válido: não tratar esse aviso isolado como prova de DNS ausente. Para o Morada, as leituras de DNS e propriedade concordam que falta concluir a configuração.

Referências operacionais: [preparação de 13/11](railway-2026-11-13.md), [runbook do alfa](../../apps/recreio/PRODUCAO.md) e [projeto Railway](https://railway.com/project/f4da4285-5b98-48b5-b03e-5be02f4e7c56).

## 4. Problemas e riscos encontrados

As prioridades abaixo significam: **alta** deve ser tratada antes de ampliar o alfa/abrir ao público; **média** exige limite explícito e plano antes de crescimento. Uma funcionalidade adiada pela proposta é indicada como lacuna de escopo, não como regressão.

### A1 — Retentativa do diário quebra após confirmação parcial — alta, reproduzido

Em [`Ator.gravarFatos`](../../apps/morada-server/src/ator.ts), os fatos recebem sequência a partir de `this.diarioSeq`; cada parte confirmada avança esse campo. Se uma parte seguinte falha, `escoar` reapresenta o passo inteiro e `gravarFatos` renumera também os fatos já confirmados. O armazenamento os recusa como duplicados. O ator então segue o caminho de reinício, em vez de concluir os fatos restantes.

Prova pontual em memória: ator real, transporte da bancada e 300 fatos sintéticos; falha injetada somente na segunda chamada de anexação. A prova exercita o método de transporte, não uma família real produzindo 300 fatos num passo:

```text
fatos: 300
primeiraFalha: INDISPONIVEL
confirmadosAntesDaFalha: 256
resultadoDaRetentativa: FATO_DUPLICADO
confirmadosAoFinal: 256
```

Correção necessária: tornar sequências e lotes imutáveis durante a recuperação da tentativa; reapresentar o mesmo lote ou continuar do prefixo comprovadamente confirmado. Definir também a atomicidade de operações lógicas que atravessem vários lotes. Testar resposta perdida, erro após cada parte e queda da instância entre confirmações, com recuperação consistente. Não basta ignorar `FATO_DUPLICADO`.

### A2 — Checksum de fotografia não é verificado na leitura — alta, reproduzido

[`ClienteDoHost.lerFotografia`](../../packages/recreio/src/host/cliente.ts) valida os metadados e o tamanho, mas não compara os bytes recebidos com `meta.sha256`. Um corpo alterado de mesmo tamanho foi aceito:

```text
accepted: true
sameSize: true
checksumMatches: false
```

O teste usou respostas HTTP locais controladas, com checksum de `MUNDO A` e corpo `MUNDO B`. Não demonstra corrupção observada em produção; demonstra ausência da conferência prometida pelos metadados. Os testes existentes usam SHA arbitrário e não detectam esse caso.

Correção necessária: verificar checksum antes de descompactar/restaurar, limitar a saída descompactada e oferecer recuperação operacional controlada a partir de uma fotografia anterior mais diário. Hoje o armazenamento lê apenas a última fotografia; conservar cinco cópias não cria automaticamente um fluxo de recuperação de corrupção.

### A3 — Revogar uma concessão não encerra imediatamente a partida — alta, inspeção do fluxo

[`revogar`](../../apps/recreio/scripts/concessoes.ts) muda a concessão e audita, mas não encerra `game_sessions`. O comentário diz “o acesso para na hora”. O batimento só entrega sessões já encerradas; não reavalia a concessão dos jogadores conectados. A nova avaliação ocorre na [renovação](../../apps/recreio/src/features/sessao-de-jogo/service.ts).

A sessão vale 15 minutos e o [SDK](../../packages/recreio/src/sdk/index.ts) renova após **2/3 da validade: aproximadamente dez minutos**. Um cliente que não solicita renovação pode continuar até o vencimento do token, com tolerância de cinco segundos. Isso é diferente da recusa imediata de uma nova entrada e da saída explícita da conta, que já encerra as sessões.

Correção necessária: fazer a revogação efetiva encerrar as sessões afetadas pelo mecanismo transacional/cursor existente, respeitando eventual outra cobertura válida. Aplicar contrato equivalente a suspensão e mudanças futuras de política. Fixar e testar o prazo máximo entre revogação e interrupção no servidor, inclusive sem cooperação do navegador.

### A4 — Privacidade e termos não correspondem ao que será implantado — alta

A [privacidade](../../apps/recreio/src/app/privacidade/page.tsx) afirma que o Recreio ainda não guarda mundos nem dados de jogo. Já existem tabelas, fotografias, diário, membros e convites persistidos. Os [termos](../../apps/recreio/src/app/termos/page.tsx) ainda dizem que jogos não estão disponíveis, apesar de o alfa por concessão já permitir abrir o Morada quando implantado.

Atualizar antes do alfa externo: dados realmente tratados, finalidades, compartilhamento entre membros, retenção, continuidade dos mundos e atendimento dos pedidos. A revisão jurídica e os aceites versionados continuam necessários para as etapas comerciais/familiares.

### A5 — Proteção familiar ainda não existe como produto utilizável — alta, lacuna prevista

O [repositório de perfis](../../apps/recreio/src/features/perfis/repository.ts) cria automaticamente `kind: adult`; a [política](../../apps/recreio/src/features/sessao-de-jogo/politica.ts) dá faixa 18 aos adultos e recusa menores. Não existem os fluxos de responsável verificado, faixa etária, pareamento, supervisão, aprovação de contato e limites de tempo previstos no Marco 1.

Além disso, `todas_as_idades`/`completo` são metadados de mundo, mas o contrato entregue ao ator não transporta uma política de conteúdo para as regras das interações. O Morada não diferencia essas políticas para restringir ações. O nome de uma política no catálogo não comprova proteção aplicada.

É aceitável manter o ensaio com adultos da equipe. Não oferecer o plano Família ou admitir menores antes de implementar e testar essas autoridades no servidor. Não reutilizar `@informach/family`/Compasso por semelhança de nome: o Recreio tem contrato comercial e perfis próprios, fora do Compasso.

### A6 — Continuidade, exclusão e exportação incompletas — alta, lacuna prevista

A [guarda compartilhada de exclusão](../../packages/auth/src/account-deletion-guard.ts) bloqueia a exclusão via Better Auth de contas com perfil Recreio. Ela preserva mundos enquanto faltam sucessão e saída, mas afeta a identidade compartilhada mesmo quando a conta tem pouco uso no Recreio. O pedido precisa de atendimento assistido; não há um fluxo completo do Recreio para fazê-lo com segurança. O encerramento de participação web pelo Compasso é uma operação distinta; não se deve confundir seus recibos com a eliminação dos dados Recreio.

Faltam transferência com aceite, saída/remoção de membro, revisão de autoria/textos, retenção/arquivamento, exportação de dados próprios e recibos de atendimento. As funções puras de sucessão no domínio e as colunas preparadas não equivalem a uma transação, rota e jornada entregues. Antes do público, ensaiar saída do responsável sem apagar nem expor dados dos demais.

### A7 — Limites de carga não abrangem toda a superfície — média, inspeção

Há limites úteis: tamanho dos quadros, baldes por conexão, intenções, atraso de envio, ingresso e tentativa de aceitar convite. Porém a [rede](../../apps/morada-server/src/servidor.ts) admite sockets antes da autenticação e a [instância](../../apps/morada-server/src/instancia.ts) não impõe teto global de conexões/entradas em andamento. `MORADA_CAPACIDADE` limita mundos, não sockets. Muitas conexões dentro da franquia individual ainda podem esgotar recursos.

A criação de [convites](../../apps/recreio/src/features/mundos/service.ts) também não tem quota/teto de pendentes. A manutenção não expurga convites vencidos, sessões de aparelho antigas ou todo o histórico técnico de sessões/posses/instâncias. Isso pede política de retenção que preserve auditoria e cursores, não um DELETE genérico.

Antes de tráfego externo: limites globais e de admissão, orçamento de operações em voo, quotas de convites, paginação das listas que podem crescer e ensaio de saturação. Não houve ataque ou teste de exaustão em produção.

### A8 — Batimento e recuperação precisam de medição com volume real — média, inspeção

[`registrarBatimento`](../../apps/recreio/src/features/posse/repository.ts) renova as posses em consultas sequenciais por mundo. Com 200 mundos configurados, são até 200 atualizações sequenciais por batimento, além das demais consultas. O cliente HTTP tem prazo de dez segundos; a posse vale 30 segundos e o ator se cerca três segundos antes.

Isso não prova que 200 mundos falhem; mostra um custo linear sem capacidade homologada. Medir p95/p99 com rede, pool e banco reais. Se necessário, renovar em lote mantendo cerca/prazo atômicos, sem aumentar TTL para esconder saturação.

A leitura de diário não é paginada e transmite bytes em base64/JSON. O teto de 8 MB vale para o diário ainda não coberto pela última fotografia; não é uma quota de armazenamento total nem uma prova de custo da recuperação. Manter Postgres enquanto os números justificarem é coerente com a decisão atual. O adapter de objetos só deve entrar por necessidade comprovada, com idempotência e recuperação próprias.

### A9 — Desligamento e disponibilidade não estão homologados — alta para operação

O processo do Morada implementa drenagem, fotografia e liberação, com prazo local de 25 segundos. A configuração do serviço consultada e a IaC não declaram `drainingSeconds`; não há variável correspondente nos nomes consultados. É necessário configurar e ensaiar o prazo que o Railway efetivamente concede entre SIGTERM e SIGKILL. Um handler no código não garante tempo de execução no provedor.

O Morada também tem um volume ligado ao processo e uma única réplica. A [documentação do Railway sobre volumes](https://docs.railway.com/volumes/reference) informa interrupção em redeploy de serviços com volume e restrição de réplicas. A [documentação de teardown](https://docs.railway.com/deployments/deployment-teardown) descreve a configuração de drenagem. Não prometer deploy sem interrupção nesta topologia.

Para o alfa, definir indisponibilidade aceita, reconexão e RTO real. Para crescimento, endereçamento/roteamento por instância e distribuição da arte precisam permitir várias instâncias antes de aumentar réplicas. Expiração de posse em 30 segundos não é, sozinha, RTO: ainda é preciso existir um processo apto a assumir.

### A10 — Backup, restauração e observabilidade exigem prova operacional — alta

A recuperação após matar a instância com banco íntegro é coberta localmente. Isso é diferente de restaurar o banco, recuperar uma fotografia inválida, voltar uma versão de código/formato ou perder um volume. O runbook pede conferir backups, mas ainda não oferece uma prova completa específica do Recreio com RPO/RTO e responsáveis.

Definir RPO separado para fatos críticos confirmados e para estado não crítico entre fotografias; testar restauração fora de produção e conferir invariantes/escopos. Antes de ativar, completar Sentry, entrega de e-mail, sessões/limites no Redis real, cron e alertas de falha de checkpoint, batimento, readiness, capacidade e manutenção atrasada. As contagens do Bastidores não substituem essa operação.

### A11 — O teste anunciado de longa duração está vazio — média, reproduzido

[`vitest.longa.config.ts`](../../packages/morada-sim/vitest.longa.config.ts) anuncia provas de 100 dias e inclui `testes/**/*.longa.ts`, mas não há arquivos correspondentes. O comando existente falha:

```text
pnpm --filter @informach/morada-sim test:longa
No test files found, exiting with code 1
```

Implementar histórias longas com nascimento/envelhecimento/mudanças, tamanho do diário/fotografias, memória e recuperação repetida; criar também ensaio prolongado do servidor/rede/cliente. A suíte normal já percorre dias de jogo, mas isso não comprova o cenário de 100 dias nem estabilidade prolongada.

### A12 — Cobrança, catálogo público e moderação ainda são trabalho substancial — alta antes da venda

Os quatro preços continuam `price_TODO_recreio_*`. Não há Checkout, Customer Portal, webhook ou reconciliador comercial próprios do Recreio. Ler `@informach/billing` para decidir acesso não implementa venda, renovação, cancelamento, reembolso, contestação e troca Individual/Família.

O [roteiro Stripe](stripe-pendente.md) já enumera a composição e os testes necessários; deve ser seguido quando chegar a etapa comercial. Nenhuma operação Stripe foi feita neste levantamento. Valores são hipóteses até custo e validação, conforme a proposta.

O catálogo atual é manifesto + ambiente. Faltam a configuração operacional auditada sem deploy, página editorial completa do jogo, requisitos/acessibilidade conhecidos e publicação com classificação confirmada. No social, não há amizade/bloqueio/denúncia e fila de moderação; não abrir essas superfícies parcialmente sem as proteções correspondentes. Bastidores deve manter leitura restrita e acionar comandos auditados do Recreio quando esses fluxos existirem.

Para uma experiência profissional, completar também edição de apelido/avatar, gestão dos aparelhos, primeiros passos e retorno ao mesmo mundo, explicação das recusas e dos estados de salvamento e tratamento de pedidos sem resposta. A [Conta atual](<../../apps/recreio/src/app/(portal)/conta/page.tsx>) exibe perfil/acesso/e-mail e saída, sem esses controles. A troca “Continuar aqui” encerra a sessão anterior no banco, mas não implementa a confirmação de checkpoint descrita na proposta. Os pedidos do SDK/ingresso no navegador não têm prazo de aplicação equivalente ao do cliente HTTP do host; uma chamada pendurada precisa produzir uma saída recuperável. Homologar teclado, foco, leitor de tela, escala de texto e hardware/navegadores suportados com pessoas; os E2E atuais não certificam usabilidade ou acessibilidade completas.

### A13 — Arte e desempenho ainda têm bloqueios de lançamento — alta/média conforme etapa

O D1 tem evidência histórica de 54 objetos/41 modelos, 11 acabamentos e três tipos de encaixe. Dois empacotamentos deram os mesmos 138 arquivos; pacote total de aproximadamente 5,88 MB com brotli. O review também mediu JavaScript do jogo em cerca de 317 kB gzip e isolamento do portal. Esses são resultados de 13/11, não medições refeitas com arte nesta sessão.

Não há homologação atual de 60 FPS em vídeo integrado, memória total da aba inferior a 1 GB ou cenários grandes. Os números do SwiftShader do D1 não certificam hardware real. O catálogo limita a oito membros/computador; 12 pessoas, tablet e celular da proposta permanecem metas futuras.

A licença ITHappy por escrito e a revisão jurídica/classificação continuam pendentes nos registros. A inspeção do histórico alcançável por `origin/main` encontrou **2.959 caminhos de objetos Git** terminados em `.zip`, `.glb`, `.fbx` ou `.blend`, incluindo pacotes antigos em `ideas/`; não são necessariamente 2.959 assets distintos ou todos licenciados. O fato verificável é que separar a arte atual não removeu os arquivos históricos. Fazer inventário de direitos/exposição e definir remediação antes da divulgação; nenhuma reescrita ou retirada de histórico foi executada.

### A14 — Auditoria da criação de perfil não acompanha a transação — média

A [ação de criar perfil](../../apps/recreio/src/features/perfis/actions.ts) chama `audit` depois de `criarPerfilProprio` confirmar. O [helper](../../apps/recreio/src/lib/observability.ts) importa/grava de forma assíncrona, sem aguardar. Uma falha depois do commit pode deixar o perfil sem o evento; a repetição retorna `criado: false` e não recompõe o registro.

Os eventos de concessão, mundo e sessão já usam auditoria transacional. Aplicar o mesmo contrato à criação do perfil, com teste de falha do writer e concorrência, antes de depender desse evento para rastreabilidade operacional.

## 5. Sequência recomendada e critérios de saída

| Ordem | Entrega | Critério objetivo |
| --- | --- | --- |
| 1 | Integridade e correções do alfa | A1/A2 corrigidos com regressões; revogação tem prazo no servidor; textos públicos correspondem aos dados; auditoria de perfil atômica |
| 2 | X4: produção fechada de adultos da equipe | DNS/TLS Morada, Sentry, readiness, cron, arte e fontes configurados; duas contas reais, queda/reconexão, revogação e deploy drenado passam; restauração ensaiada |
| 3 | Eficiência operacional | Custo por hora de mundo com 1/2/4/8 pessoas, orçamento por assinatura, capacidade segura, latência e saturação medidos; quotas/retenção e alertas ativos |
| 4 | D2–D8: jogo que dá vontade de continuar | Criar família, casa/interações/família/som/ciclo de mundos; sete dias de jogo e retorno sem assistência; hardware-alvo e estabilidade prolongada homologados |
| 5 | Marco 1: família e convívio seguro | Quatro perfis reais em quatro aparelhos, adulto independente e menor pareado, políticas aplicadas por ação/mundo, supervisão e denúncia; troca/saída/sucessão preservam identidades |
| 6 | Marco 2: beta e cobrança de teste | Famílias convidadas voltam sozinhas; custo/margem conhecidos; ciclo Stripe de teste e conciliação passam, incluindo eventos duplicados/perdidos/fora de ordem |
| 7 | Marco 3: público pago | Licenças/classificação/termos/aceites, suporte/moderação, exportação/exclusão/restauração e operação aprovados; família externa assina, joga, convida e cancela sem ajuda |

A infraestrutura pode avançar em paralelo à revisão de licenças e às decisões jurídicas. A ordem de produto original continua válida: provar a operação, fazer o Morada ser divertido, completar a segurança familiar e então cobrar. Não há base para anunciar uma porcentagem única de conclusão que misture esses marcos.

## 6. Evidência de verificação desta sessão

Ambiente: Windows, Node 24.15.0, pnpm 9.15.0, PostgreSQL 16 local em container. O runner criou, migrou e apagou bancos `recreio_review_*`; não utilizou banco de produção. Suas verificações isoladas removem Redis/Sentry externos e usam e-mail de teste e chaves descartáveis. Nenhuma arte privada foi carregada nesta sessão.

| Comando/verificação | Resultado |
| --- | --- |
| Tipos dos seis workspaces Recreio/Morada (`pnpm --filter … typecheck`) | Exit 0 |
| `pnpm --filter @informach/recreio test` | 106 passaram |
| Portal, cliente e servidor (`pnpm --no-bail --filter … test`) | Portal: 199; cliente: 112; servidor: 91 passaram |
| Simulação na mesma execução | 99 passaram; um teste de convívio ultrapassou 5.000 ms |
| Repetição isolada do caso de convívio, sem mudar timeout | Um passou em 3,32 s, 22 não selecionados; não prova resolução da instabilidade da suíte |
| Empacotador, sem arte | 50 passaram, um pulado por depender da arte, um falhou em `symlinkSync` com `EPERM` no Windows |
| `pnpm --filter @informach/recreio-app test:integration` | 146 passaram em nove arquivos; exit 0; banco descartável removido |
| Builds executados pelo runner de E2E | Morada compilado e Next standalone concluídos; sem alteração de dependências |
| `pnpm --filter @informach/recreio-app e2e` | Cinco passaram em 10,7 min, sem arte privada; exit 0; banco descartável removido |
| `pnpm --filter @informach/morada-sim test:longa` | Exit 1: nenhum teste encontrado |
| Provas pontuais de A1/A2 | Falhas reproduzidas; saídas registradas nas seções acima |
| Railway, DNS e HTTPS | Somente leitura; estados na seção 3 |

As falhas de timing e permissão de symlink não demonstram, por si, defeito de domínio. Também impedem chamar esta execução de suíte integralmente verde. A prova vazia de longa duração é uma lacuna independente.

Comandos de verificação de tipos e unidade executados, preservados integralmente para repetição:

```powershell
pnpm --filter @informach/recreio --filter @informach/recreio-app --filter @informach/morada-sim --filter @informach/morada-server --filter @informach/jogo-morada --filter @informach/morada-arte typecheck
pnpm --filter @informach/recreio --filter @informach/recreio-app --filter @informach/morada-sim --filter @informach/morada-server --filter @informach/jogo-morada --filter @informach/morada-arte test
pnpm --no-bail --filter @informach/recreio-app --filter @informach/morada-sim --filter @informach/morada-server --filter @informach/jogo-morada test
pnpm --filter @informach/morada-sim exec vitest run testes/convivio.test.ts -t 'troca entre os quatro'
```

A segunda linha interrompeu o conjunto na falha de symlink do empacotador; a terceira executou os outros quatro workspaces sem interromper na falha da simulação. A repetição isolada não mudou o código nem o timeout.

Na jornada principal do Morada, duas contas jogaram a mesma família, uma caiu, a outra continuou e o mundo voltou depois da morte da instância: **51 batimentos confirmados, zero sem resposta, 19 fotografias de 3.925 a 4.836 bytes**. O caso levou 9,2 minutos nesta máquina. O último caso de troca de janela também passou, com um batimento e duas fotografias. O runner reportou arquivo lento; essa duração não é uma medição de latência do produto nem certifica o prazo de recuperação em produção.

```text
VERIFICATION REPORT
-------------------
Claim: A jornada E2E isolada do portal com o Morada compilado passa nesta árvore.
Command: pnpm --filter @informach/recreio-app e2e
Executed: 15/11/2026, nesta sessão, depois da inspeção do código.
Exit code: 0
Output summary: 5 passed (10.7m); Removed isolated database recreio_review_3ec057222a0049d39f46cc8fef74d350.
Warnings: arquivo de testes lento, depreciação do import de configuração do Sentry e FORCE_COLOR/NO_COLOR.
Errors: none
Verdict: PASS
```

Esse PASS é da jornada declarada. A execução conjunta de unidade não passou integralmente: houve `EPERM` no symlink do empacotador e timeout de 5.000 ms na simulação; o comando de longa duração também terminou com exit 1, sem arquivos de teste. Nenhum desses resultados foi convertido em aprovação global.

Não foram executados todos os testes dos outros produtos, auditoria completa de dependências, restauração do backup remoto ou teste de carga/estabilidade em produção. Não houve nova avaliação manual de usabilidade/acessibilidade ou medição gráfica com a arte privada.

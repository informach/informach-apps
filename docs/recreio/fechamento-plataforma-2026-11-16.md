# Recreio: fechamento da plataforma web

**Autorização:** em 16/11 o titular priorizou concluir o Recreio como plataforma,
usando o Morada atual como integração de referência. A evolução de D3–D8 do jogo
continua separada. Este registro acompanha entregas; não declara conclusão.

**Especificação:** `informach/artes-3d`, `paginas/recreio.html` v2.2, revisão
`cd2c31aee`; contratos existentes em `packages/recreio/README.md` e
`apps/recreio/CLAUDE.md`. O código público de partida é `cf437f7`.

## Decisões do titular nesta execução

- Individual: R$ 59,90/mês e R$ 599,00/ano. Família: R$ 127,90/mês e
  R$ 1.279,00/ano. Os quatro valores foram confirmados; não são mais hipóteses.
- O titular cadastra quem joga, inclusive uma criança sob sua responsabilidade.
  Responsabilidade declarada e compra são fatos distintos de verificação externa
  de identidade. Não criar recibos de verificação que não ocorreram.
- Conta administrativa não exige que o pagante ocupe um perfil de jogador.
  Individual cobre um perfil; Família cobre até quatro, independentemente de
  quantos perfis sejam menores. Um adulto convidado usa o próprio login.
- Testes pesados, builds, testes de navegador e cargas somente no GitHub.
- A prova humana da transferência, o hardware integrado e o orçamento pago
  de uptime continuam adiados. Não repetir pedidos já respondidos.
- Arte licenciada continua privada. Não reescrever o histórico público.
- A venda depende da homologação comercial e da experiência efetivamente
  disponível; a priorização da plataforma não publica o Morada incompleto.

## Critérios de fechamento e ordem

Cada linha exige código, testes negativos de autorização/concorrência,
evidência remota, implantação quando aplicável e documentação atualizada.
Um teste isolado ou uma tela não encerra a linha.

| Frente | Entrega e aceite | Estado |
| --- | --- | --- |
| F0 — SDK independente | Dados opacos por perfil/jogo com revisão, conflitos preservados e cotas; conquistas idempotentes; jogo interno sem mundos prova gravar, recarregar e recuperar conflito sem importar Morada | Implantado em `6b51dd13`; prova do jogo interno no CI |
| F1 — Conta e perfis | Gestão sem perfil de jogador; criação própria/menor, convite e saída de adulto, até quatro cobertos, mesmos IDs/progresso; titularidade comercial não concede poderes sobre outros adultos | Incremento de adultos implantado em `204cf79c`; integração pública `07c5d5b9` e oito consumidores atualizados/conferidos. Família desligada; homologação integral pendente |
| F2 — Aparelhos e proteção | Pareamento de uso único, expiração, credencial restrita, PIN seguro, gerações e revogação; perfil infantil não abre administração por chamada direta | Pareamento/PIN/contexto, seleção e estante protegida implantados com fluxo desligado; ativação depende dos aceites restantes |
| F3 — Políticas e sessões | Faixa social e classificação separadas; regras versionadas, conteúdo de mundo, horários, tempo agregado e confirmação da troca de aparelho; autoridade atual no servidor | Salvamento restrito, pausa, agregado e retenção implantados em 3f2b1239, após sete gates/CI compartilhado e 0177/0178; modos desligados, ativação depende dos demais aceites |
| F4 — Social e moderação | Amizade por código, aprovações, presença privada, convite por destinatário, bloqueio/silêncio/denúncia; fila e ações auditadas sem acesso ao conteúdo dos mundos | Infraestrutura implantada em `396fe932`, oito gates e CI compartilhado aprovados, 191 recibos/0190, manutenção 200. Social continua desligado; convites dirigidos e proteção de participantes dependem da conclusão de F5 |
| F5 — Mundos | Coadministração, convites de membro aprovados, visitas revogáveis com prazo e anfitrião, arquivamento/retomada; preservar membros e progresso dos demais | `d014bd90` implantado após oito gates e CI compartilhado da integração `04ab6be5`: 1054 integrações, 41 E2E comuns e oito de checkpoint. Restauração prévia, 204 recibos/hashes, fonte servida, mapas Sentry, prontidão e manutenção conferidos. Famílias/social/visitas permanecem desligados; [provas e limites](visitas-temporarias-2026-11-17.md) |
| F6 — Comercial | Teste sem cartão iniciado na primeira sessão, preços configurados por modo, Checkout/portal próprios, webhooks e reconciliação isolados, renovação, cancelamento, troca e eventos adversos homologados | Candidatas qualificadas em PostgreSQL/SDK e APIs Sandbox; preços aprovados e portal native-v2 separado conferido em 44758652951. Preview comercial isolado permanece disponível. Catálogo/portal/webhook Live, capacidades antigas, implantação e jornadas humanas finais continuam pendentes; [execução atual](cancelamento-nativo-2026-11-19.md) |
| F7 — Direitos | Exportação pessoal, resolução dos vínculos compartilhados, retirada de identificadores pelo adapter do jogo e encerramento recuperável; cobrança e identidade global tratadas separadamente | Retirada/diário/fotos, conferência financeira, encerramento público e cópias pessoais qualificados em candidatas; navegador nativo v2 44760442710 mostrou prazo técnico original e confirmou limpeza. Cobertura integral ainda tem lacunas na [matriz das 79 fontes](cobertura-dados-pessoais-2026-11-20.md); reaplicação nativa no banco restaurado e implantação permanecem abertas. [Provas](encerramento-conta-2026-11-19.md) |
| F8 — Armazenamento e recuperação | Objetos privados com checksum e limites, migração aditiva dos bytes existentes, retenção delimitada, backup agendado cifrado e restauração do objeto guardado, sem restaurar sobre a origem | Captura SQL/fotos/índice e cluster frio sem credenciais da origem qualificados no bucket real. A prova **44650838063/f5e658ec** confirmou com foto normalizada, recibos quarentenados, capacidades temporárias revogadas, rollback/repetição/demais tabelas preservados e limpeza. Migração/custódia real, replay F7, identidade/finanças atuais, agenda, RPO/RTO e admissão de tráfego continuam pendentes. [Contrato](normalizacao-recuperacao-2026-11-19.md) |
| F9 — Catálogo e experiência | Página real de jogo, capacidades separadas da permissão, editorial/avisos operacionais, conta/assinatura/supervisão utilizáveis e acessíveis, suporte pelo contato central | Ficha pública canônica qualificada em 44766663038/44766666583, com revisão visual desktop/390, classificação em análise e contato central. Implantação e jornadas integradas finais permanecem pendentes; [prova](ficha-publica-jogos-2026-11-20.md) |
| F10 — Operação | Limites em toda a superfície, testes 1/2/4/8 no executor remoto, custo exclusivo e rateio explícitos, alertas e recuperação operacionais, documentação de incidentes e atendimento | Protocolo nativo 1/2/4/8 qualificado em 44771690103, com 908 comandos, saída/recuperação e zero perda. Latência inclui automação; não é FPS ou saturação. Recursos do alfa ocioso foram lidos, sem custo faturado/rateio por mundo-hora. Operação final permanece pendente; [medição](capacidade-protocolo-2026-11-20.md) |
| F11 — Fechamento | Jornadas de duas contas e quatro perfis, políticas em chamadas diretas, compra/cancelamento de teste, privacidade e restauração; fontes/configuração conferidas em produção e limites externos registrados | Pendente |

Offline, desktop e TV são expansões condicionais P3 da proposta, não requisitos
da primeira versão web. A prova interna de SDK sem mundos entra nesta execução;
um segundo jogo público depende do catálogo e da produção desse título.

## Fronteiras permanentes

`packages/recreio` mantém contratos/SDK, sem banco ou jogo. `apps/recreio` compõe
persistência, autenticação e cobrança. Schema e migrations em `packages/db`;
catálogos em `packages/config`. Jogos só recebem identidade de perfil e política
limitada; nunca conta, e-mail, nascimento, credencial de banco ou Stripe.

Migrations são geradas pelo workflow `db-generate.yml`, revisadas e testadas com
PostgreSQL descartável no GitHub. Nenhuma migration gerada é editada à mão.
Os consumidores de schema, auth, config, billing e UI precisam de gates próprios.

Gestão, cobrança e privacidade exigem autenticação nativa recente e autoridade
administrativa atual. Escolher um perfil de criança não conserva um caminho
aberto à gestão do titular. Compra não implica administração de mundo ou da
família fictícia do jogo. Toda mutação de autoridade conserva auditoria atômica.

## Proteção e evidência

A decisão de cadastro pelo responsável não elimina as proteções do serviço.
Registrar a declaração e seu escopo, manter padrões protetivos e impedir acesso
a conteúdo sem classificação compatível. O catálogo do Morada continua
`em_analise`; não transformar isso em uma classificação confirmada para liberar
menores. A homologação infantil usa título interno classificado para a fixture.

Referências consultadas em 16/11: [Lei 15.211, texto atualizado](https://www2.camara.leg.br/legin/fed/lei/2025/lei-15211-17-setembro-2025-797997-normaatualizada-pl.html)
e [orientação da ANPD de 28/10/2026](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-que-esclarece-quem-deve-cumprir-e-quais-sao-as-responsabilidades-das-plataformas-na-protecao-de-criancas-e-adolescentes).
São bases de implementação; não declarar parecer jurídico ou homologação externa.

## Execução atual

O incremento de adultos e cobertura de F1 tem
[plano próprio](grupos-adultos-2026-11-17.md) e foi implantado em fonte congelada
`204cf79c` com 184 recibos/0183 e família desligada. A
[prova operacional](evidencias/grupos-producao-2026-11-17.json) separa a promoção
limitada da integração Git atual e do fechamento de F1–F11. Não há venda
liberada nem social em produção; portal/Morada mantêm fontes explícitas para
separar a plataforma da integração D3 concorrente.

Primeiro subprojeto: [SDK e dados de perfil](dados-de-perfil-2026-11-16.md).
Em 17/11, [checkpoint e troca](checkpoint-sessoes-2026-11-17.md) e
[avisos de tempo](avisos-tempo-2026-11-17.md) avançam em candidatas. Os gates,
limites e diferenças entre fonte candidata e produção ficam nesses registros.
A reprodução inicial exige as APIs ainda ausentes no contexto retornado pelo SDK.
Os gates seguintes precisam testar o banco, chamadas HTTP reais do app e o jogo
sem mundos, além dessa superfície. Continuar em série até fechar as frentes;
não interpretar a conclusão de F0 como conclusão do Recreio.


### Atualização de recuperação e cobertura — 20/11

A matriz candidata agora cobre 79 tabelas (0242/243 recibos). Os metadados
próprios, auditoria e índices já passaram nos gates indicados na matriz. O
cluster frio mais recente 44793400837/f466c178 confirma vinte superfícies de
capacidades revogadas, importação/admissão histórica e coordenação privada
conservada após I/O, com filas fotográficas vazias. Não executou apagador pessoal
nem prova publicação/finanças atuais. A prova nativa posterior à captura está
em execução na candidata f8480bcd; [frente atual](reaplicacao-nativa-2026-11-20.md).
Nenhuma dessas novas capacidades foi ativada na produção.

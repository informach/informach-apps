# Recreio — jornada externa Stripe de teste

Candidata de verificação de F6/F11, executada e ainda não aprovada. Não habilita
venda, não usa chaves live e não se conecta ao banco de produção.

O workflow Recreio recebe `sandbox_journey=true` e a conta Stripe esperada.
Usa o segredo GitHub de teste já conferido, PostgreSQL 18 descartável e navegador
no executor remoto. O catálogo é resolvido pelo script comum para a origem
localhost do ensaio. Objetos ausentes de configuração de teste são criados de
forma idempotente; os produtos/preços comerciais continuam na fonte única.

O CLI oficial Stripe 1.55.12 é baixado com SHA-256 fixado
`89d0bbec0970917a07fbd4d3a98afecf95b08f88f0687362c4a94447a0610245`,
conferido na release oficial. Um listener de teste encaminha eventos reais
para o endpoint local. Seu segredo é extraído em memória e mascarado antes de
compor o app; o processo não publica streams do CLI ou payloads de clientes.

A jornada cria uma conta nativa sintética sem jogador, registra aceite, abre
Checkout real e usa o cartão de teste do Stripe. Exige recibo de webhook
recebido, conciliação nativa com fatura paga BRL de R$ 59,90 e ausência de cortesia.
Depois cria um jogador e prova uma SID paga, gravação e reabertura pelo SDK
interno de perfil, sem mundos ou Morada. O cenário não declara um jogo público.

As sessões de Checkout abertas desse customer são expiradas; suas assinaturas
são inventariadas/limitadas antes da limpeza e canceladas no provedor, com resposta terminal conferida. Falha de
limpeza conserva a falha da jornada. O recibo só inclui IDs de correlação,
contagens/estados e origem; diagnóstico limita-se aos nomes/tipos dos campos e rótulos de controles,
sem valores, DOM, URLs financeiras ou segredos. Traces, vídeos e capturas do
pagamento ficam desligados. O banco efêmero e os processos são encerrados.

Este ensaio não comprova disponibilidade do endpoint público de produção,
recorrência real, troca, cancelamento pelo usuário ou homologação jurídica.
Cada prova seguinte precisa de evidência própria. O encaminhamento do CLI
também permanece distinto de entrega direta pelo endpoint cadastrado no Stripe.

Primeira execução chegou ao Checkout real em `44334339799`/`e2ade13a`, após
conferir catálogo para localhost e iniciar o encaminhamento. O botão de
confirmação não foi localizado; não há prova de pagamento. Recibo do ensaio
registrou o customer sintético e zero assinaturas. A sessão aberta foi expirada
por operação delimitada à conta/modo/tag desse ensaio, com estado terminal
conferido; [registro da limpeza](evidencias/limpeza-stripe-sandbox-44334339799.json).
A candidata passa a procurar confirmação nos frames do formulário e a expirar
Checkouts abertos na própria limpeza. Ajustes usam a candidata de operação;
os dezesseis gates serão repetidos na mesma fonte final antes da integração.

A execução `44337220466`, fonte `832abb8764e53f315e811083646d55cf4a119bfb`,
localizou e acionou a confirmação. O diagnóstico mostrou o desafio hCaptcha
(`Verify Answers`/opções de acessibilidade); o retorno ao portal não ocorreu.
Não houve assinatura criada. A própria limpeza expirou o Checkout aberto e
confirmou zero assinaturas. O artefato sanitizado foi baixado com tamanho e
SHA-256 conferidos na API do GitHub:
[registro da execução](evidencias/stripe-jornada-44337220466.json).

O Stripe documenta que suas interfaces de pagamento têm medidas que impedem
automação. Esta execução exige homologação humana do Checkout hospedado; não
autoriza contornar o desafio, relaxar proteção nem substituir esta prova por
um pagamento criado por API. Os testes remotos dos contratos HTTP/SDK locais
continuam distintos da prova externa. Não repetir automaticamente a jornada
hospedada enquanto esta limitação persistir.

Fontes primárias: [limites da automação](https://docs.stripe.com/automated-testing),
[CLI e autenticação](https://github.com/stripe/stripe-cli/wiki/Using-Stripe-API-Keys),
[listen](https://github.com/stripe/stripe-cli/blob/master/pkg/cmd/listen.go),
[release fixada](https://github.com/stripe/stripe-cli/releases/tag/v1.55.12).

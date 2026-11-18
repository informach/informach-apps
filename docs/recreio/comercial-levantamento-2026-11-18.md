# Recreio — levantamento para a homologação comercial

F6 do [fechamento da plataforma](fechamento-plataforma-2026-11-16.md), autorizada
pelo titular. Este registro organiza fatos e pendências; não habilita cobrança,
ensaio pago ou venda. A qualificação de F5 continua em paralelo no GitHub.

## Contratos confirmados

- Individual: R$ 59,90/mês ou R$ 599/ano, um perfil coberto.
- Família: R$ 127,90/mês ou R$ 1.279/ano, até quatro perfis cobertos.
- Pagante não precisa ocupar perfil de jogador. Adulto convidado usa login próprio.
- Responsabilidade pelo menor é declarada; não gravar verificação externa fictícia.
- Cobrança de Recreio continua isolada de Compasso e Suíte Edi.
- Testes pesados, builds, E2E e cargas somente no GitHub Actions.

Na proposta privada `artes-3d/paginas/recreio.html` v2.2, linhas 583–604, o teste
sem cartão compara 48 horas com sete dias, começa na primeira sessão autorizada
e cobre até quatro perfis. É concessão promocional persistida pelo servidor,
não assinatura Stripe. Cadastro, emissão de ingresso e clique em Jogar não
comprovam sessão autorizada. A análise de ativação específica do Morada continua
separada da entrega técnica da plataforma; jogo interno não prova diversão pública.

## Código já disponível

`packages/config/src/products.ts` contém os quatro produtos e valores aprovados.
Os IDs Stripe de dev/prod ainda são placeholders. A composição precisa usar
`getConfiguredProducts` e as variáveis registradas no catálogo, sem mapa de preços
paralelo ou inferência pelo valor cobrado. Não provisionado por este levantamento.

A inspeção seguinte encontrou ausente o campo `stripePriceEnvironmentVariable`
nos quatro produtos. A candidata registra `RECREIO_INDIVIDUAL_MONTHLY_PRICE`,
`RECREIO_INDIVIDUAL_ANNUAL_PRICE`, `RECREIO_FAMILY_MONTHLY_PRICE` e
`RECREIO_FAMILY_ANNUAL_PRICE` no próprio catálogo. A resolução existente muda
somente o modo pedido, preservando valores/intervalos e IDs do outro modo.
Não altera preços no Stripe, não cria variáveis no Railway e não habilita venda.

`apps/recreio/src/features/acesso/repository.ts` lê assinaturas do pagante do
grupo com `provider=stripe`, `app=recreio`, `subjectType=user`. A mesma leitura
atende pagante sem perfil. Cortesias e testes são concessões distintas.

O motor existente em `packages/billing/src/checkout-lifecycle.ts` conserva
intenção de Checkout, tentativa admitida, expiração fixa e recuperação do
resultado remoto; `managedCheckout` já é usado pela Suíte Edi. A composição do
Recreio precisa preservar esse protocolo e seu isolamento, sem copiar o emissor
Edi ou os contratos Compasso. Inspeção não comprova homologação do Recreio.

Versão instalada no package: Stripe Node 22.1.0; adapter fixado na API
`2026-04-22.dahlia`. Não atualizar dependências por uma recomendação genérica.

## Achado que deve ser resolvido antes da cobrança

### Primeiro incremento em qualificação: prazo finito

A candidata passa a carregar começo/fim do período e fim do teste ao domínio.
Status ativo só concede capacidade no período vigente, com fim exclusivo;
cancelamento e teste reduzem esse prazo. `trialing` sem fim do teste não
concede acesso. Cortesia vigente continua sendo uma origem separada.

Ingresso também recebe o limite relido sob trava (acesso/aparelho), sem alterar
o teto de sessenta segundos. SID e renovação já usam o limite da mesma decisão
do kernel; o incremento acrescenta provas de prazo e de renovação recusada
quando o período persistido vence. Nenhum teste pesado foi executado localmente.
Qualidade e testes serão executados no GitHub antes de integrar esta mudança.

Isso fecha somente a lacuna temporal quando qualificado: o status espelhado
ainda não substitui prova financeira, tratamento de estorno/contestação,
conciliação e homologação real do Recreio com Stripe. Cobrança permanece
desligada; nenhum preço, customer, assinatura ou charge foi criado.

### Diagnóstico de origem

O carregador do Recreio conserva status/produto/cancelamento, mas ainda não
leva o começo/fim do período financeiro ao contrato de domínio. A decisão em
`packages/recreio/src/dominio/acesso.ts` aceita status ativo e usa somente a
data de cancelamento como limite. Também precisa recusar uma data de
cancelamento já vencida mesmo se o evento seguinte atrasar.

Antes de habilitar cobrança, a admissão precisa de período finito vigente e
prova financeira apropriada; evento perdido, status antigo ou sincronização em
conferência não podem produzir acesso ilimitado. Clampar ingresso/SID/renovação
e capacidade de cobertura ao mesmo fato relido na transação. `getProSubscription`
continua a fonte comum da elegibilidade por status; não alterar a política dos
outros aplicativos para corrigir o adapter comercial do Recreio.

## Provas ainda exigidas

### Sequência em execução

1. Prazo finito: candidata `4a46a3dd`, oito gates de Recreio aprovados em
   `44276622593`; o CI compartilhado do catálogo seguinte também cobre os
   testes puros. Não implantada.
2. Preços configuráveis: candidata `f81c2c95`, gates `44278073436` e CI
   `44278072474` em curso. Fonte única no catálogo, sem provisionar cobrança.
3. Teste sem cartão: recibo `recreio.trial_claims`, uma vez por pagante/grupo,
   ligado por FK à concessão exata de teste/família e aos seus instantes. Coorte
   48 h/7 dias e versão persistidas; geração aditiva própria no GitHub. O schema
   inicial não inicia teste nem está publicado. Ingresso provisório deve provar
   elegibilidade sem iniciar concessão ou dar gameplay; somente a transação que
   confirma a primeira SID pode criar a concessão. Falha e recusa revertem tudo.
4. Admissão de teste: preservar contas → grupo → perfil → aparelho, conferir a
   composição depois de esperar, reutilizar o kernel e a decisão única. Quatro
   perfis concorrentes não podem criar quatro testes. Históricos existentes não
   são reiniciados. Modo desligado por padrão; fixtures separadas com modo real.
5. Checkout/portal nativos: preparar consentimento e autoridade atual sem exigir
   jogador, usar intenção recuperável do billing e reler autorização antes de
   devolver dados financeiros. Rede fora das transações. Portal não pode trocar
   Família por Individual sem a seleção explícita da cobertura no Recreio.
6. Fatos financeiros: assinatura espelhada e fatura paga são fatos distintos.
   Reutilizar o leitor do provedor e o motor de períodos, admitindo estorno,
   contestação, resultado desconhecido e conciliação com revisão observável.
7. Homologação: servidor/HTTP/E2E e provedor real em sandbox, sem efeitos live,
   depois conferência de catálogo, webhook, segredos, cron e operação. A venda
   permanece bloqueada até F7–F11 e catálogo elegível; fixture não é jogo público.

- Concessão de teste atômica com a primeira sessão autorizada, uma vez por
  pagante/grupo elegível, prazo/coorte persistidos e relógio servidor. Recusas e
  rollback não iniciam teste; histórico/concessões antigos não são reiniciados.
- Catálogo e preços conferidos no provedor no modo correto; conta nativa atual
  e login recente nas decisões comerciais. Papel de jogador ou gestão do mundo
  não autoriza contratar, cancelar ou ver dados fiscais de outro adulto.
- Checkout recuperável sem duplicidade por concorrência, resposta perdida,
  retorno falso do navegador ou expiração. Confirmação vem de fatos do provedor.
- Portal restrito ao customer e produtos Recreio; troca/cancelamento com
  revisão e tratamento explícito da redução de quatro perfis para um.
- Webhook assinado, corpo bruto limitado, modo/conta/app conferidos e eventos
  duplicados/fora de ordem. Renovação, inadimplência, estorno e contestação
  revogam ou limitam autoridade atual sem apagar progresso compartilhado.
- Reconciliação recuperável, falhas observáveis, suporte e separação entre
  cancelamento financeiro, saída de grupo, exclusão no app e encerramento global.
- Homologação real em sandbox, incluindo perda de resposta, dois adultos,
  quatro perfis e tentativas por aparelho infantil. Não confundir assinatura
  sintética ou assinatura local de webhook com comunicação real com o provedor.

Migrations F5 0191–0203 continuam ausentes de produção. Mudança comercial
adicional exige geração própria no GitHub e seu histórico de upgrade. Antes de
publicar código que acione o migrator, controlar o comando para migração sem
seeds e conferir backup/restauração e consumidores compartilhados.

## Documentação primária consultada

Em 18/11, Context7 retornou a documentação oficial de
[idempotência Stripe](https://docs.stripe.com/api/idempotent_requests),
[erros e recuperação](https://docs.stripe.com/error-low-level) e
[assinatura de webhook no SDK](https://github.com/stripe/stripe-node/blob/master/README.md).
O protocolo deve conservar intenção/payload e tratar resultado desconhecido;
chave nova não é prova de ausência de operação remota. Webhook exige os bytes
originais e a assinatura, antes de interpretar o evento. Esses documentos
orientam a implementação e não substituem as provas acima.

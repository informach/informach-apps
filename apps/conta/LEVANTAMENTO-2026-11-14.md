# Compasso: levantamento para produção em 14/11/2026

Esta é uma fotografia da conferência, não prova de que todos os fluxos estejam
homologados. O titular autorizou concluir o corte após os gates. A fonte operacional continua
em [PRODUCAO.md](PRODUCAO.md), com os detalhes de infraestrutura em
[INFRAESTRUTURA.md](INFRAESTRUTURA.md).

## Infraestrutura observada

- Railway `informach-apps/production`: Conta e Dia de Estrela estão provisionados,
  mas sem fonte e sem deployment. Os apps antigos estão online; seis tentativas
  recentes de atualização falharam no readiness, mantendo os deployments anteriores.
  O banco tem 81 migrations; o build da main exige o journal posterior. No log
  consultado, o migrator terminou com código 1 por causa da trava explícita do
  corte, embora o inventário Railway apresente esse deployment como SUCCESS.
  Não confundir o estado do deployment com sucesso da migração.
- O plano real com as flags de lançamento ligadas apresenta oito crons novos e
  retira exatamente os sete financeiros legados descritos em INFRAESTRUTURA.md,
  além de atualizar configurações dos serviços. Nenhum banco ou volume aparece
  para exclusão. A execução atual desses crons ainda é necessária até o corte.
  Os genéricos têm como destinos apenas Cozya e Agenda da Turma.
- O teste offline `pnpm compasso:test:infrastructure` passou. O plano com as flags
  desligadas ainda apresenta diferenças de configuração; não foi aplicado.
- O Railway recusou um backup manual por limite do plano. Com autorização da
  titular, foi removido o backup vencido de 30/08 e cinco backups automáticos de
  01/10 a 07/11. Permaneceram os dois backups manuais de setembro e os sete
  automáticos de 09/11 em diante. Há nove backups; reservar a vaga para o backup
  final após a parada dos writers. PITR não está habilitado nesse PostgreSQL.
- A matriz da Agenda no CI encontrou deadlock em inserção direta de fixture. As
  três inserções passaram a tomar primeiro a trava familiar, como os escritores;
  as 54 jornadas desktop e mobile passaram localmente com banco e Redis isolados.
- A matriz do Cozya recarregou a lista antes de terminar uma marcação otimista.
  O teste agora aguarda a resposta da gravação antes de conferir a persistência;
  as 20 jornadas desktop e mobile passaram com banco e Redis isolados.
- Em 14/11, após a titular configurar os registros no Cloudflare, o Railway
  confirmou a propriedade e certificados válidos para `conta.informach.com.br`
  e `dia-de-estrela.informach.com.br`. As consultas externas chegam ao proxy
  Cloudflare e as duas origens retornaram `Application not found` do Railway,
  coerente com serviços sem deployment. A titular confirmou os dois destinos
  CNAME; o painel ainda não os reconhece sob proxy. Verificar a resposta real
  após publicar.

## Banco e cobrança

- Foi executada a conciliação de leitura no banco real e Stripe live. Ela encontrou
  sete contratos locais em três cadastros: seis ativos e um histórico cancelado.
  Os seis ativos são atribuídos pelos titulares aos seus testes internos. Helena
  lembrou que pode ter existido outro cliente que pagou um mês e cancelou: não
  presumir sua identidade nem ausência de outros fatos históricos a partir desta
  consulta limitada a contratos locais. A listagem de assinaturas live do Stripe
  também retornou somente uma cancelada entre esses produtos, da Agenda; não
  identifica essa pessoa nem inventaria pagamentos avulsos. Produtos independentes
  da mesma conta Stripe permanecem fora deste corte.
- A conciliação terminou com bloqueios: períodos pagos ainda não foram registrados
  na representação local de períodos, uma fatura aparece como não resolvida e
  existem três intenções de Checkout legadas. A ausência dos períodos pode
  refletir o estado anterior à migração; não significa, por si, perda dos
  pagamentos. É preciso examinar fatura e Checkouts por titular, reconciliar a
  leitura financeira após a migração e repetir a conferência durante o corte,
  sem editar saldos, apagar recibos nem encerrar contratos como atalho.
- Consulta posterior ao Stripe confirmou que as três sessões das intenções estão
  concluídas e pagas; continuam bloqueadas até o recibo vincular cada sessão ao
  contrato correspondente. A fatura observada na Agenda estava em rascunho de
  renovação automática e depois foi finalizada e paga pelo Stripe, sem intervenção.
  O inventário foi corrigido para ignorar apenas intenções
  com recibo da mesma sessão e do mesmo cliente, sem desconsiderar as pendentes.
- Em nova cópia do backup restaurada e migrada, a leitura Stripe somente GET
  reconciliou os sete contratos, produziu 25 períodos de pagamento e três recibos
  de checkout, sem revisões financeiras abertas. O verificador corrigido então
  apresentou somente a fatura ainda em rascunho como bloqueio; a cópia foi removida.
- Após o pagamento automático dessa fatura, um novo backup restaurado e migrado
  passou pela mesma conciliação: sete contratos, 26 períodos, três recibos,
  nenhuma revisão aberta e nenhum bloqueio no verificador. A cópia foi removida.
  Antes do corte, repetir o inventário e obter o backup final com writers parados.
- A restauração do backup real em PostgreSQL 18 descartável passou: contagens e
  atributos conferidos foram preservados; a sequência aplicou 83 migrations na
  cópia e a segunda execução não alterou os fatos verificados. O ensaio removeu
  seus recursos temporários. Isso não congela a origem nem substitui o backup final.
- O produto Compasso live já possui imagem e descrição; a imagem respondeu GET 200
  como PNG. Os cinco preços ativos
  correspondem aos valores aprovados e às variáveis da Conta. O portal live está
  ativo para meio de pagamento e histórico; alteração/cancelamento de assinatura
  estão desligados no portal. O webhook da Conta e seu segredo ainda faltam;
  devem ser criados após DNS/TLS e readiness, com vendas desligadas. Webhooks
  antigos permanecem necessários durante a reconciliação.

## Antes de abrir o serviço

1. Confirmar o histórico do possível cliente anterior e examinar a fatura e os
   Checkouts pendentes, sem pressupor que a transição afete somente contas internas.
   Validar o registro dos períodos pagos depois da migração na cópia e no corte.
2. Conferir o encaminhamento DNS, o CI do commit de lançamento e revisar novamente
   o plano Railway e os segredos sem imprimi-los.
3. Coordenar a parada dos escritores e jobs antigos, resolver reservas, obter o
   backup final e liberar o migrator somente na janela de corte documentada.
4. Publicar Conta e consumidores com vendas desligadas; verificar readiness,
   OIDC, família, permissões, aparelhos, privacidade, trabalhadores e observabilidade.
5. Configurar e testar o webhook central, reconciliar novamente, retirar os sete
   crons substituídos com a entrada dos novos e confirmar suas execuções.
6. Só então habilitar a admissão comercial e homologar Checkout, créditos,
   extrato e continuidade sem cobrança sobreposta, com os aceites pessoais exigidos.

O CI geral e a matriz Compasso do commit `8d1c5b79` estavam em execução durante
esta consulta; a aprovação do commit anterior não comprova o resultado desse commit.

# Recreio — execução nativa das trocas

Próximo incremento de F6. A fundação e as provas da API não concluem este fluxo.
O [registro de trocas](trocas-plano-2026-11-18.md) conserva os gates e a DDL.

## Ordem de implementação

1. Preparar cotação e seleção sob identidade nativa recente do próprio pagante,
   ciclo financeiro antes das travas de conta/grupo/perfis e contrato atual.
   Payer sem jogador continua válido. Cotação não cria recurso no provedor.
2. Persistir aceite dos termos exatos e seleção, com auditoria na transação.
   Repetição devolve o recibo; não muda valores, prazo ou instante do aceite.
   Cotação/aceite vencidos sem tentativa podem ser encerrados como não enviados.
3. Antes de qualquer efeito externo, persistir a tentativa sobre o mesmo
   contrato/compra/modo/revisão. O runtime valida catálogo e corpo imutável.
   Upgrade usa a data do proporcional e chave fixa; redução usa agenda no mesmo
   contrato. Nenhuma URL/resultado financeiro volta sem reautorizar após a rede.
4. Recuperação técnica trata somente tentativas já admitidas. Logout não apaga
   fatos nem autoriza novo pedido. Resposta perdida é procurada pela correlação
   exata; janela vencida não autoriza outra cobrança. Cancelamento de operação
   enviada exige prova remota; falha desconhecida continua em conferência.
5. A conciliação observa a operação aceita e a oferta efetiva. Oferta atual,
   recibo aplicado, observação completa de pagamento, revisão/seleção e corte
   das sessões devem ser capturados juntos, sem uma janela que interrompa um
   jogador durante upgrade já quitado. Metadata da compra inicial permanece.
6. Se os perfis mudaram, conservar o fato financeiro e marcar revisão da seleção
   no contrato atual. O leitor recusa acesso até confirmação nativa. Uma escolha
   antiga somente conserva/reduz cobertura ainda ligada; nunca reativa perfil.
   Confirmação posterior usa a capacidade da oferta atual, com autoridade,
   versões e auditoria próprias; não edita o aceite antigo.
7. Compor recuperação/cron/webhook e telas, executar jornadas completas, conferir
   todos os consumidores compartilhados e só depois integrar/implantar.

## Fronteiras operacionais

O worker financeiro atual possui portas de leitura. A recuperação de uma troca
admitida precisa de uma capacidade explícita adicional, delimitada pelo recibo;
não transformar qualquer observação do Stripe em autorização de POST. Sem essa
capacidade, tentativa existente é falha operacional, nunca ausência de trabalho.
Continuar a atender os outros pagantes e reportar falhas parciais no HTTP.

A recuperação conserva a tentativa anterior ao I/O e o orçamento temporal;
nenhuma rede fica em transação PostgreSQL. Desligar novas vendas não elimina
gestão/reconciliação de contratos ou operações anteriormente admitidos. As
configurações de produção continuam desligadas nesta implementação.

O registro da oferta atual precede a conferência dos fatos novos na mesma
transação. Uma oferta diferente da compra inicial só é admitida pelo recibo
atual aplicado, com escopo/destino/revisão exatos. Não aceitar qualquer troca
histórica nem deixar a inicialização da revisão um sobrescrever outra revisão.

## Gates obrigatórios

- PostgreSQL/SDK fechado: escopo, sessão infantil, login vencido, logout, corrida
  de seleção, expiração, replay divergente, auditoria recusada e rollback.
- Tentativas/recuperação: efeito admitido e resposta perdida, cancelamento,
  ausência de configuração, TTL e correlação sem recriar/debitar novamente.
- Aplicação: upgrade pendente conserva oferta anterior; quitado exige a própria
  fatura. Redução exige a fase efetiva e preserva dados dos demais perfis.
- Crédito anual: comprovar origem/liquidação dos créditos e eventos adversos
  antes de admitir fatura sem débito novo; valor zero isolado não basta.
- Navegador remoto: aceite completo e perfis guardados, acesso com/sem jogador,
  retorno, gestão e recuperação com reautorização. Checkout hospedado conserva
  a pendência humana por CAPTCHA; provas da API não o substituem.

Testes, builds, E2E e cargas somente no GitHub. Adotar DDL gerada intacta e
cumprir a condição de tabela vazia da 0211 antes de qualquer implantação.

## Candidata de preparação da redução

`troca-cotacao-service`/`troca-cotacao-repository` implementam apenas a preparação
da redução. Exigem contrato nativo com pagamento confirmado recente, sem
cancelamento/revisão pendentes, mesma oferta/revisão, seleção completa atual e
login recente do pagante. Guardam renovação, data do fim pago e seleção sem
alterar cobertura, assinatura, aceite ou provedor. Repetição conserva o recibo;
cotação vencida sem tentativa pode ser encerrada para preparar outra.

Ainda não há Server Action, tela, aceite persistido, execução externa ou cron
ligados a esse preparo naquela candidata inicial. A fábrica recebe catálogo exclusivamente da composição
servidor. A prova em PostgreSQL/SDK fechado cobre pagante sem jogador,
isolamento, revisão, seleção, vencimento e rollback por auditoria recusada;
precisa concluir no GitHub antes de anunciar aprovação.

Primeira candidata `29c549f1`/`44354321188`: o gate de tipos apontou a captura
de uma origem opcional pela closure da fixture; a origem admitida passa a ter
uma referência constante. A fixture também precisava verificar o estado
durável do próprio pagante, pois a fila compartilhada conserva falhas
intencionais de outros cenários. Nenhuma validação de produção foi relaxada.
A fundação anterior `9ee466fa` concluiu os dezesseis gates `44351670813`,
incluindo 0211 e os termos puros do aceite.

## Candidata de aceite e encerramento sem envio

`troca-aceite-service`/`troca-aceite-repository` registram aceite dos termos
persistidos sob o mesmo ciclo financeiro e autoridade nativa recente. Relêem
período, oferta, revisão e seleção atuais. Replay conserva o instante e o estado
do recibo, inclusive se já encerrado; não reabre uma operação. Auditoria e aceite
são atômicos. Nenhuma assinatura, cobertura ou recurso externo é alterado.

O encerramento local fica disponível independentemente da abertura de novas
vendas, somente para cotação sem tentativa admitida. Tentativa sem ID remoto
continua incerta e não é declarada cancelada. Operação enviada precisa do fluxo
de confirmação do provedor, ainda pendente. Os testes remotos acrescentam
aceite, replay, isolamento, termos/perfil alterados, encerramento, tentativa
incerta e rollback de auditoria. Não há Server Action ou tela ligada ainda.

As fontes `13b31497` e `63b69792` concluíram, respectivamente, os dezesseis
gates `44371478415` e `44372327644`. A segunda inclui aceite e encerramento,
com os testes PostgreSQL/SDK fechado; não prova pagamento externo ou implantação.

## Candidata de envio e recuperação da redução

O executor persiste tentativa, correlação e auditoria antes de qualquer POST.
Confere os valores/preço/intervalo aceitos contra o catálogo servidor novamente
na admissão, revalida seleção e período e conserva a chave da operação.
Criação/configuração com resposta perdida mantém revisão; recuperar usa o
mesmo recibo, sem aceitar termos novos ou criar outra autorização. Recuperação
de tentativa admitida independe de novas vendas e da disponibilidade do catálogo.

Cada chamada do adapter nativo e cada página de recuperação recebe o orçamento
restante, sem repetição automática do SDK. Há teto de histórico e recusa de cursor
repetido. O contrato comum mantém a política anterior quando não há orçamento.
O adapter também confere a identidade da assinatura retornada, além do cliente
e dos metadados de compra. Referências: documentação oficial do
[stripe-node](https://github.com/stripe/stripe-node/blob/master/README.md) e
[opções por chamada](https://github.com/stripe/stripe-node/wiki/Passing-Options).

A captura posterior usa a autoridade técnica da tentativa; logout não apaga
fatos externos e a devolução do recibo exige nova admissão nativa. O executor
ainda não aplica oferta/cobertura: observar a fase efetiva deixa revisão até
a captura financeira atômica do próximo incremento. Não há telas ou cron de
recuperação ligados, nem execução em produção. Os novos casos PostgreSQL/SDK
fechado precisam concluir os gates remotos desta candidata antes de qualquer
declaração de aprovação.

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
ligados a esse preparo. A fábrica recebe catálogo exclusivamente da composição
servidor. A prova em PostgreSQL/SDK fechado cobre pagante sem jogador,
isolamento, revisão, seleção, vencimento e rollback por auditoria recusada;
precisa concluir no GitHub antes de anunciar aprovação.

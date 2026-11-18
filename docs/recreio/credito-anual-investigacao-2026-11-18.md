# Recreio — origem do crédito anual

A passagem Individual anual → Família mensal é aumento imediato pela política
aprovada. Pode produzir fatura com total negativo, saldo credor e renovações
sem débito novo. O plano não pode tratar o simples status `paid` ou uma linha
positiva como captura. A liberação precisa rastrear a fatura inicial quitada,
as linhas creditadas, o consumo do saldo e estornos/contestações dessa origem.

## Ensaio de API executado

O workflow `Recreio`, operação `sandbox_plans`, recebe o cenário opcional
`annual_credit`. O padrão `monthly_upgrade` conserva o ensaio mensal anterior.
Conta, catálogo, chave de teste e executor GitHub são verificados antes de
criar recursos. Tipos e regressões dos adapters/leitor rodam antes do ensaio.
O banco fica em endereço descartável de metadata, sem conexão de produção.

O cenário anual prepara somente customer/relógio próprios e pagamento de teste:

1. Capturar a fatura Individual anual do catálogo aprovado.
2. Conferir o proporcional, aplicar a mesma data/chave e observar a fatura de
   crédito, linhas referenciadas, replay e eventos da atualização.
3. Avançar um período e observar uma renovação Família mensal consumindo saldo.
4. Confirmar que o leitor ainda retém cobertura sem origem rastreada.
5. Estornar a captura anual de origem, reler a prova e encerrar somente os
   recursos do próprio relógio. Limpeza é verificada mesmo na falha.

O [run 44388863046](https://github.com/informach/informach-apps/actions/runs/44388863046),
fonte `ace8a1d8b34ca89eeb0b58e869d6b72b00819c74`, passou. Artefato 14466554355,
1.773 bytes, SHA-256 e limites no [recibo](evidencias/credito-anual-api-44388863046.json).
ZIP baixado e seus dois JSONs inspecionados. A captura anual foi 59.900 centavos;
a troca gerou linha positiva 12.790, crédito -59.900 e total -47.110, sem captura.
A linha negativa referencia a fatura/linha anual original. O ledger registrou
`applied_to_invoice` negativo nessa fatura e positivo na renovação: consumo de
12.790, saldo passando de -47.110 para -34.320, sem novo pagamento.
O estorno da origem anual foi detectado, o leitor reteve os períodos sem origem
rastreada e a limpeza dos recursos próprios foi confirmada. Isso demonstra por
que o tipo do ledger, sozinho, não distingue criação e consumo do saldo.

O artefato contém apenas IDs de teste, valores, tipos do ledger e correlações;
não contém nomes, contato, cartão, segredos, URLs financeiras ou respostas brutas.
As flags de Checkout/aceite/jogo/webhook nativos permanecem falsas. Mesmo um
ensaio bem-sucedido ainda não implementa a cadeia de financiamento no app.

## Implementação posterior

Construir o rastreamento com os fatos efetivamente observados, sem pressupor
qual tipo do ledger o provedor emitirá. Exigir escopo do cliente/modo/contrato,
catálogo aprovado, limites/paginação e prova de captura de cada origem. Um
ajuste manual desconhecido não é pagamento. Eventos adversos da origem devem
invalidar o período dependente no mesmo motor financeiro. Perdas/ambiguidades
ficam em revisão; não apagar históricos ou inventar prova de valor zero.

A cotação, tentativa recuperável, fatura própria do upgrade, seleção/contrato
atuais e captura financeira precisam da mesma homologação nativa das reduções.
F6 e a venda continuam pendentes enquanto essa cadeia não estiver concluída.

## Adapter de aumento em qualificação

`providers/stripe-recreio-upgrades` separa o aumento do adapter genérico. A prévia
confere modo, cliente, assinatura, compra original, item único, período e todas
as linhas/valores. Relê a assinatura após o I/O; o envio fixa o item e o segundo
aceitos, reconfere o proporcional e usa chave exclusiva por pedido. Recuperação
somente de leitura procura eventos pela chave exata e mantém incerteza quando
eles não existem. Fatura desconhecida, cursor repetido, assinatura divergente e
janela de idempotência vencida não autorizam outra cobrança. Metadata original
não é reescrita. Uma observação `applied` do provedor não concede cobertura.

O [run 44391555451](https://github.com/informach/informach-apps/actions/runs/44391555451),
fonte `8f6a4dfa03b077e85ed99fcfcdcbe05194055ba7`, executou tipos, regressões
do SDK fechado e o ensaio anual consumindo esse adapter. Passou; o replay
recuperou a fatura pelo evento de chave exata. Artefato 14469051528, 1.794 bytes,
hash e escopo no [recibo próprio](evidencias/credito-anual-adapter-44391555451.json),
baixado e inspecionado; estorno detectado e limpeza confirmada. Os dezesseis
gates dessa fonte ainda precisam concluir. Integração com cotação/aceite/transação
nativos e origem financeira do saldo continuam abertas, assim como F6.

O cenário mensal seguinte passa a consumir o mesmo adapter próprio: valor
proporcional fixo, cartão de teste recusado, replay da fatura pendente, pagamento
explícito dessa fatura, recuperação somente de leitura e depois a agenda de
redução já existente. Essa extensão requer nova execução antes de atribuir ao
adapter próprio a prova mensal anterior do adapter genérico. Continua sendo
somente API externa, sem Checkout/aceite/cobertura nativos.

Referências oficiais consultadas: [Stripe Node, recursos da API](https://github.com/stripe/stripe-node),
[saldo do cliente](https://docs.stripe.com/billing/customer/balance) e tipos
locais do SDK Stripe 22.1.0 fixado no lockfile. API estável
`2026-04-22.dahlia`, sem adoção de endpoints de preview novos.

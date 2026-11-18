# Recreio — origem do crédito anual

A passagem Individual anual → Família mensal é aumento imediato pela política
aprovada. Pode produzir fatura com total negativo, saldo credor e renovações
sem débito novo. O plano não pode tratar o simples status `paid` ou uma linha
positiva como captura. A liberação precisa rastrear a fatura inicial quitada,
as linhas creditadas, o consumo do saldo e estornos/contestações dessa origem.

## Ensaio de API preparado

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

Referências oficiais consultadas: [Stripe Node, recursos da API](https://github.com/stripe/stripe-node),
[saldo do cliente](https://docs.stripe.com/billing/customer/balance) e tipos
locais do SDK Stripe 22.1.0 fixado no lockfile. O ensaio externo ainda precisa
ser executado e seu artefato inspecionado antes de registrar resultados.

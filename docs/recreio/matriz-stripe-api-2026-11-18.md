# Recreio — matriz externa das doze trocas

Extensão autorizada de F6. A matriz nativa de cotação/aceite/replay/encerramento
passou em `68b8fb6d`/`44419586441` (124 testes financeiros no total). Esta etapa
complementa essa evidência com as APIs reais do provedor em modo de teste.
Não comprova Checkout, aceite nativo, entrega de webhook ou gameplay reais.

## Escopo e critérios

`sandbox_plans_scenario=plan_matrix` percorre os doze pares distintos entre as
quatro ofertas aprovadas. Preços vêm do catálogo conferido da conta de teste;
não há novo mapa de valores. Cada direção possui relógio/cliente/assinatura
próprios, identificados por run, tentativa e caso. O executor exige GitHub/CI,
chave de teste, catálogo e conta esperada antes de criar recursos.

- Aumento: prévia pelo adapter nativo, aplicação e replay da mesma fatura,
  contrato/preço e metadata original preservados, financiamento rastreável.
  Estorno da captura de origem precisa revogar a prova dependente.
- Redução: replay da mesma agenda, preço anterior até a fronteira e aplicação
  da fase futura. A origem é estornada antes de avançar o relógio; a nova
  renovação deve permanecer financiada por sua captura própria, sem tomar o
  pagamento antigo como cobertura. O caso não afirma estorno tardio de cartão.
- Todo caso confere assinatura, customer, modo, produto original e autorização
  antes de relatar o resultado. Fatos normalizados passam pelo coletor/ledger
  reais, sem criar concessão ou editar flags históricas para simular cobertura.

## Limites operacionais

O protocolo usa o SDK/API já fixados, sem atualização de dependências. Avanços
de até 50 dias respeitam o limite de duas recorrências mensais por chamada;
somente `ready` conclui cada avanço. Referência primária:
[avanço do relógio Stripe](https://docs.stripe.com/api/test_clocks/advance).
O orçamento da matriz é de onze minutos, com prazo por requisição e sem retry
automático; a limpeza dispõe de até um minuto próprio. O job tem teto de 25
minutos para instalação, tipos, testes prévios e ensaio.

Resposta perdida da criação reutiliza os mesmos parâmetros e chave. Descoberta
por nome exato é limitada e exige inventário completo; ausência após criação
incerta não confirma limpeza. Antes de cancelar/liberar/apagar, a limpeza
confere o relógio, marcadores, cliente, assinatura e agenda próprios. Inventário
inesperado ou falha permanece no recibo e falha o gate. A exclusão da simulação
remove seus objetos de teste, conforme a
[documentação Stripe](https://docs.stripe.com/billing/testing#view-and-delete-simulations).

O artefato contém IDs técnicos sintéticos, valores da cotação e estados, sem
segredos, cartões, contatos ou URLs financeiras. Status, quantidade de direções
comprovadas e limpeza são fatos distintos. Apenas doze casos aprovados fecham
a matriz de API. Continuam necessários o gate remoto desta candidata, a rodada
integral da fonte final e as jornadas comerciais nativas restantes.

Primeira candidata `c91d481d`/`44423417693`: recusada no typecheck, antes de
criar recursos. O ensaio usava `null` onde o adapter recebe ID opcional e
omitia `mode` na fábrica de agendas; corrigido o chamador, sem afrouxar os
tipos do provider. A prova de API ainda precisa executar.

# Avisos de tempo: previsão separada da autorização

Incremento de F3, ainda em candidata. Não conclui a pausa com salvamento,
o prazo restrito de gravação nem a reautorização na mudança do dia.

## Problema e prova anterior

O controle olhava somente 61 segundos à frente e limitava `pausaEm` ao fim
da concessão curta. A proposta pede aviso com dez minutos. A reprodução
`8d87c3d`, `44056721385`, sobre `149ea66`, falhou nos quatro casos esperados:
orçamento diário, fim de horário, mudança do dia com avanço IANA e fim de
horário com retorno IANA. Retornava previsão nula. As outras 471 integrações
passaram, incluindo ausência de aviso além do horizonte. Matriz reduzida
somente na branch de reprodução; não integrá-la.

## Implementação e arquivos

- `politicas/controle-repository.ts`: consultar até dez minutos, devolver o
  instante exato do saldo diário e procurar a primeira fronteira IANA.
  A série tem teto de 601 segundos; agrupar os primeiros instantes por minuto
  absoluto e calendário local conserva transições e reduz o resultado.
  A consulta continua somente de leitura, sem modificar o agregado.
- `packages/recreio/src/contrato/sdk.ts`: documentar `tempo.pausaEm` como
  previsão. A autorização continua em `expiraEm`, com concessão infantil de
  até 60 segundos, sem renovação implícita.
- Página e `jogar/components/hospedeiro.tsx`: observar o controle de perfis
  protegidos mesmo com troca coordenada desligada. O aviso de tempo não
  depende de suporte a checkpoint do título.
- `jogar/controle.ts`: usar a diferença entre dois instantes recebidos do
  servidor, sem relógio do navegador para calcular o orçamento. Aviso discreto
  e não bloqueante; pedido de troca e barreira têm prioridade.
- `test/tempo-menor.integration.ts`: conservar intactas as cinco fixtures da
  reprodução, conferir prazo curto e ausência de escrita do agregado.
- `e2e/familia-cadastro.spec.ts`: configurar dez minutos pela supervisão real
  e conferir o aviso ao jogar o título interno L na estante protegida.

## Gates e limites

Escopo exige os sete gates do Recreio no GitHub, sem testes/build local.
A assinatura do contrato não muda; consumidores ainda precisam compilar
com a fonte final. Nenhuma migration adicional. Famílias e checkpoint seguem
desligados em produção. Não confundir aviso correto com garantia de gravação
depois do corte: a capacidade restrita de salvamento continua pendente.

Na candidata `fa3736f`/`44057662548`, os cinco casos de previsão passaram.
A integração falhou em uma comparação anterior de participações: os mesmos
dois registros completos vieram em ordem inversa numa consulta sem `ORDER BY`.
O teste passa a ordenar as duas leituras pelo ID, conservando a igualdade de
todos os campos. Não se altera escritor, autorização ou dado de produção.
Nova rodada completa ainda necessária.

A rodada corretiva `f4a8a157`/`44058600992` passou nos sete gates. O CI
compartilhado `4d9bd217`/`44056229698` terminou aprovado; o único delta
compartilhado até `f4a8a15` é o comentário do significado da previsão, e o
delta funcional do app está coberto pelos gates finais. Integrada em `2475661`,
com conteúdo funcional idêntico, e conferida no deployment
`2fb61ccb-0a7a-4b90-8ffb-aee00f7a15a3`. Famílias e checkpoint continuam `off`;
o aviso ainda não está disponível a perfis infantis em produção. F3 não concluído.

Calendário e agrupamento conferidos na documentação do PostgreSQL 18:
[séries temporais](https://www.postgresql.org/docs/18/functions-srf.html) e
[conversão IANA e truncamento explícito em UTC](https://www.postgresql.org/docs/18/functions-datetime.html).

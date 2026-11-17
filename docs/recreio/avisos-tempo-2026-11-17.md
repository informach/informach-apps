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

Calendário e agrupamento conferidos na documentação do PostgreSQL 18:
[séries temporais](https://www.postgresql.org/docs/18/functions-srf.html) e
[conversão IANA e truncamento explícito em UTC](https://www.postgresql.org/docs/18/functions-datetime.html).

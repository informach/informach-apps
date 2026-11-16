# Prazos dos pedidos no navegador

A12: o SDK e a emissão de ingresso não possuem prazo de aplicação. O cliente
do host já usa 10 s, mas isso não protege o navegador, nem uma resposta cujos
cabeçalhos chegaram e cujo corpo nunca termina. Uma renovação pendurada também
impede agendar a próxima tentativa e anunciar a perda ao vencer a sessão.

## Incremento autorizado

1. Em `packages/recreio/src/transporte/prazo.ts`, limitar a operação inteira a
   10 s com cancelamento de fetch/corpo e temporizador removido ao concluir.
   A promessa pública deve terminar mesmo se um adapter ignorar o sinal.
2. No SDK, aplicar o mesmo contrato à obtenção do ingresso, troca, mundos,
   renovação e saída. Fornecer `AbortSignal` ao emissor de ingresso; funções
   existentes sem argumentos continuam compatíveis. Renovação limita a espera
   ao prazo restante da sessão e não usa resposta tardia depois do encerramento.
3. No portal, encaminhar o sinal ao fetch de ingresso e conservar o limite
   quando esse helper for chamado diretamente. Manter cookies por origem,
   códigos de recusa, CSP e tokens somente nos cabeçalhos/corpos já previstos.
4. Testes cobrem falta de cabeçalhos, corpo interrompido, emissão que não
   responde, cancelamento, limpeza do timer, expiração durante renovação e
   resposta tardia. Testes/builds somente no GitHub, incluindo orçamento de
   bundle e todos os consumidores do package no workflow do Recreio.
5. Sem repetição automática de mutações. Tempo esgotado significa resultado
   desconhecido, não rollback no servidor; consultar o estado antes de repetir
   criação/convite. Checkpoint na troca de aparelho continua uma entrega própria.

## Homologação e implantação

O código aplica o prazo à operação inteira, cancela o sinal ao concluir e
descarta respostas tardias. A saída possui confirmação remota separada da
parada local: duas chamadas simultâneas compartilham um pedido; depois de
falha, uma nova chamada pode tentar encerrar novamente. Somente resposta ou
recusa terminal conhecida encerra essa tentativa como confirmada. Não repetir
automaticamente mutações quando o resultado é desconhecido.

Fonte isolada `d13038b7`: seis gates `43806077949` e repetição main
`43806891362` aprovados no GitHub, incluindo portal, cliente, integração e
versões reais. Implantado em ambos os serviços; saúde/prontidão públicas 200,
fonte e deployments conferidos. [Evidência operacional](evidencias/prazos-producao-2026-11-16.json).

O package compartilhado disparou também o rebuild do Morada. Comparação Git
com `22a3db6` confirma igualdade dos arquivos de `apps/morada-server`,
`morada-sim` e `morada-arte`: conserva Mundo V2/protocolo 1. Manifesto de arte
ativo relido por SSH: V3, SHA-256 `4198478735b643e07d4ce0821db82654c42847bbf996d1d07a99a5890b21672f`.
Não ativou editor D3, Mundo V3 ou manifesto V4.

Mapas do portal enviados ao Sentry em 16/11 às 04:56:25,285 UTC e release
`d13038b7` conferida. Consulta dos dois projetos sem grupos não resolvidos em
produção nas últimas 24 horas. Manutenção automática confirmada às
05:05/05:10/05:15 UTC, `ok=true`, contagens zero; sem inferir limpeza global
ou carga de 500 remoções em produção. A proteção familiar, o checkpoint na
troca, a retenção restante, o D3 e as demais frentes seguem em implementação.

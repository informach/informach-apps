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

## Candidata em preparação

O código aplica o prazo à operação inteira, cancela o sinal ao concluir e
descarta respostas tardias. A saída possui confirmação remota separada da
parada local: duas chamadas simultâneas compartilham um pedido; depois de
falha, uma nova chamada pode tentar encerrar novamente. Somente resposta ou
recusa terminal conhecida encerra essa tentativa como confirmada. Não repetir
automaticamente mutações quando o resultado é desconhecido.

Testes adicionados para prazo, corpo aberto, emissor que não responde,
operações do SDK, expiração da renovação e confirmação da saída. Verificações
pesadas e implantação ainda pendentes; Biome e diff conferidos localmente.
O diagnóstico de nomes no celular do D3 permanece separado e aberto.

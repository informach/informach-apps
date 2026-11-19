# F7 — adapter de retirada pessoal do Morada

Estado: implementação candidata, sem efeito nativo ou implantação. É a
integração de privacidade do jogo existente; não conclui ou ativa D3–D8.

`@informach/morada-sim/direitos` oferece transformação pura de estado e de
fotografia. Não recebe conta/e-mail/nascimento/credencial, não acessa rede,
banco, relógio ou sorteio, nem conserva estado externo. O coordenador do
Recreio ainda deve comprovar consentimento, referência/SHA, autoridades, cerca,
checkpoint, diário, versões anteriores, objetos e replay antes de aplicar.

A transformação retira concessões de família, preferência de moradores,
autoria pessoal de pedidos e recibos/histórico de edição daquele perfil.
Recibos de outros autores permanecem; não se apaga o cache inteiro de comandos
para evitar perder idempotência alheia. Somente IDs do protocolo de edição
atribuídos ao perfil e o comando comprovado da própria fundação são removidos.

A fundação preserva seu recibo impeditivo de nova criação, com marcador que
não é identidade emitida pelo Recreio. Nomes da família e dos moradores
originalmente nomeados são identificados pelos IDs do recibo durável, inclusive
se um morador mudou de família. A retirada desses textos exige decisão explícita
no plano consentido. Nomes passam a rótulos genéricos; IDs, relações, aparência,
saldos, objetos, posições, relógio e contadores são preservados. As revisões
das entidades efetivamente alteradas avançam sem saturação. Não é substituição
genérica por nome/UUID. Uma referência inesperada restante impede concluir.

O adapter de fotografia aceita as chaves conhecidas dos mundos V1/V2/V3 e
conserva a versão original ao gravar. A leitura/migração em memória precisa
voltar sem perda ao original antes de transformar; a saída é reaberta e
comparada canonicamente com o resultado esperado. Campo raiz desconhecido,
versão futura, colisão de campo legado com formato novo e relógio/mundo
divergente recusam. V1/V2 não são promovidas a V3 por esse caminho.

Testes sintéticos preparados: origem imutável, preservação de terceiros e de
progresso, idempotência, textos sem decisão, proveniência depois de mudança de
família, recibos de edição, referência residual, limite de revisão, V1/V2/V3 e
recusa de perda na migração. Devem executar somente no GitHub. Essas fixtures
não substituem prova com o processo publicado.

Restam composição nativa e adapter do título interno, cercas/posse/SIDs e todos
os writers, fotografias e diário históricos, expurgo/retirada de objetos,
referências/resumos/nome do mundo no portal e aplicação do livro externo na
restauração. Nenhum mundo real ou arte licenciada foi utilizado nesta etapa.
Não declarar anonimização completa ou encerramento a partir deste componente.


Primeira quality `44533801048`/`222c7c6a`: tipos passaram; na simulação,
250 cenários passaram e dois testes novos selecionavam o primeiro vizinho
preexistente em vez do morador realmente criado pelo fundador. A fixture passou
a selecionar o ID comprovado no recibo real de fundação e a exigir também que
o vizinho permaneça idêntico. A regra de preservação de terceiros não foi
alterada para satisfazer o teste. A correção ainda precisa de prova remota.


Após corrigir a seleção da fixture, os catorze cenários novos passaram dentro
dos 252 da simulação na rodada integral `44535164302`/`aa95fb7b`. Isso não
qualifica alterações posteriores nem equivale à execução de retirada real.

A composição binária seguinte confere SHA/tamanho antes de abrir gzip, exige
UTF-8 e JSON produzidos sem ambiguidades pelo writer nativo e cruza mundo,
tick e versão. Depois da transformação, prepara novo gzip/checksum dentro do
teto do catálogo, sem gravar ou conceder autoridade. O orçamento aberto de
64 MiB passou a ser uma constante compartilhada com o decoder do servidor;
seu valor permaneceu o mesmo. Testes negativos incluem expansão excessiva,
chaves JSON repetidas e metadados divergentes. A nova composição ainda requer
gate remoto próprio; fonte do servidor em produção permanece fixada.


Quality `44540431072` chegou aos testes e recusou a importação da simulação
pelo grafo web do portal. O preparador binário foi movido para
`apps/recreio/scripts/direitos/morada.ts`, composição do worker operacional;
nenhum módulo web o importa. A lista de importadores de jogos permitidos
permaneceu idêntica e uma nova regressão recusa importar scripts operacionais
por `src`. A preparação pesada não deve executar no processo Next. O worker
e os efeitos nativos ainda serão compostos; mover a função não os implanta.

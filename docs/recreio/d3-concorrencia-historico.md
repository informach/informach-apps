# D3: concorrência e histórico próprios

Plano de continuação do [editor](d3-construcao-compras.md), autorizado no escopo
integral. Execução em série; testes, builds e cargas somente no GitHub. Mundo
V3/protocolo 2 continuam candidatos: não publicar o formato enquanto estes
contratos e os gates de arte/versões não estiverem prontos.

## Travas de edição

Trava é presença temporária; não é propriedade da peça nem permissão familiar.
Vence mesmo com o jogo pausado. Compra/mover/pintar/venda continuam sujeitos à
autorização atual, sequência durável, revisão, colocação e saldo do servidor.

1. Acrescentar um registro limitado de travas ao estado transitório da execução,
   separado da fotografia. Cada montagem de ator recebe uma geração nova do
   host, sem sorteio/relógio ambiente na simulação. Um contador seguro e crescente
   distingue concessões nessa geração; não reutilizar identificadores após
   liberar, expirar ou reconectar. Teto de 16 travas e uma por perfil presente.
2. O host entrega tempo monotônico inteiro antes de admitir pedidos/renovações
   e no acompanhamento periódico. A fonte real usa `performance.now()`; a bancada
   injeta o relógio controlado. Não usar o relógio do jogo ou um prazo do cliente.
   Prazo inicial de 15 s, renovação a cada 5 s; expiração conferida na admissão,
   sem depender exclusivamente de um timer de limpeza.
3. Definir aquisição/renovação/liberação estritas em `comandos/` e tratá-las
   antes da memória genérica de comandos, sempre com sessão/autoridade atuais.
   O servidor deriva peça e regiões da operação candidata e do catálogo; o
   navegador não escolhe um cômodo, uma caixa arbitrária ou o tamanho do bloqueio.
   Mover cobre peça, pegada atual e destino; comprar cobre destino; pintar/vender
   cobrem a peça. Conferir sobreposição entre regiões e peças, lote/andar e revisão.
   Preparar a área exige `decorar`; isso não concede `gastar`, aprovação de
   colocação ou dispensa do limite financeiro na confirmação da operação.
4. O pedido financeiro referencia a concessão vigente na geração/sessão atuais.
   Um recibo já confirmado pode responder novamente após a trava terminar,
   depois de conferir autorização atual; uma operação nova não usa essa exceção.
   Nenhum recibo antigo volta a aplicar efeitos ou renovar uma trava.
5. Liberar ao encerrar seleção, sair/perder sessão, perder acesso ou substituir
   conexão. Queda não conserva a trava de obra na janela de graça do personagem.
   Na recuperação de instância não existe trava anterior a revalidar.
6. Projetar autor, alvo e prazo restantes para o editor mostrar quem está mexendo
   na peça/região. Esse estado não contém tokens Recreio. Rascunho continua local;
   uma resposta atrasada não pode substituir seleção nova. Manter no máximo um
   pedido de trava em voo e preparar a intenção financeira só após a concessão
   correspondente. Falha de renovação exige nova aquisição/revisão explícita.

Arquivos: `morada-sim/src/{execucao.ts,comandos/,sistemas/presenca.ts,
sistemas/contexto.ts,dominio/tipos.ts,visao/replicacao.ts}`;
`morada-server/src/{ator.ts,instancia.ts,main.ts}`;
`jogo-morada/src/{modelo/editor-da-casa.ts,espelho/,hud/EdicaoDaCasa.tsx,cena/}`.
Conferir schemas de recibos/fatos e a ordem do diário antes de exigir a trava.

## Estado da integração das travas

Estado em 15/11, integração das travas em candidata: aquisição, renovação e
liberação já passam por sessão e autoridade atuais; o ator fornece geração
por montagem e tempo monotônico, inclusive pausado. A confirmação financeira
exige a referência vigente; o recibo durável continua respondendo sem reaplicar
efeitos depois da expiração. Presença pública projeta alvo/autor/prazo sem SID.
O cliente mantém uma preparação em voo, renova a seleção e cancela ao perder
conexão, visibilidade ou contexto gráfico. Os testes novos cobrem reentrada,
revogação, referência forjada, expiração, resposta atrasada e queda antes/depois
do journal. A primeira candidata `684c0f85` passou os seis gates em `43781777001`.
A continuação `c72d5ae2` também passou os seis gates em `43782414101`, acrescentando contorno amarelo
em um único buffer reutilizado e lista das outras pessoas por casa, além da
jornada de duas contas pelo convite real, bloqueio, liberação por reconexão,
compra e restauração. A prova privada com arte completa `43783239739`, executor
`ad2563459`, passou as cinco jornadas nessa fonte, incluindo as duas contas
convidadas. [Prova numérica](evidencias/obras-compartilhadas-2026-11-15.json).
A captura mostrou o contorno reservado encoberto pela prévia local exatamente
na mesma região; a ordem de desenho foi corrigida em candidata posterior,
ainda exigindo outra captura para comprovar a indicação amarela.
O prazo restante também marca presença para replicação antes de expirar.
O histórico abaixo continua pendente.
O host publicado fixado na matriz de versões passou a `18f52aa`, que contém
somente a correção da reconexão, preservando Mundo V2/protocolo 1.

## Desfazer e refazer

Histórico é conteúdo persistido; presença e travas não o substituem. Cada ação
de desfazer/refazer é outro pedido durável e outro fato, com autorização atual.
Nunca restaurar uma fotografia por cima da atividade dos demais.

1. Guardar os dados mínimos de antes/depois da operação e seu delta financeiro
   num histórico limitado: até 50 passos por autor e 128 no mundo. O piso de
   sequência durável já existente não pode ser apagado com essa poda.
2. Selecionar somente o próximo passo próprio compatível. Conferir que peça,
   revisão e pré-condições ainda correspondem ao efeito do autor; alterações
   alheias na peça impedem compensação. Mudanças financeiras independentes não
   autorizam repor saldo absoluto antigo: aplicar o delta ao saldo atual.
3. Compra desfeita devolve o valor efetivamente pago; venda desfeita exige o
   saldo necessário para devolver a revenda recebida. Nada é cobrado no Stripe.
   Refazer cobra/credita o contrato original admitido, sem preço do navegador,
   e exige disponibilidade atual da mesma versão de conteúdo.
4. Remoção/recriação não pode causar ABA. Conservar o ID ao restaurar a peça,
   mas atribuir revisões por um relógio global de objetos, inteiro seguro e
   persistido no mundo. Cada criação/mudança admitida consome a próxima revisão;
   validação/recusa/replay não consomem. Assim uma peça restaurada nunca repete
   a revisão antiga, sem um mapa crescente de tombstones. Fotografia/diário
   conservam esse relógio, inclusive depois da poda do histórico. Conferir
   navegação, ocupação, apoios e rotas novamente; recusar estouro do contador.
5. Emitir compensação, saldo, versões, continuidade, atualização do histórico
   e recibo num único fato indivisível. Falha/reenvio/queda não repetem estorno
   ou cobrança. Desfazer recusado não elimina o passo nem produz efeito parcial.
6. Expor disponibilidade, motivo de conflito e valor na interface. Ações próprias
   novas encerram apenas a ramificação de refazer daquele autor, sem apagar
   trilha de auditoria ou interferir na história de outra pessoa.

### Desenho da compensação

O passo conserva antes/depois da parte estática da peça, contrato de conteúdo,
permissões admitidas e delta realmente aplicado. Ocupação não é restaurada.
Cada autor tem pilhas de desfazer/refazer; a ordem de admissão global define
a poda determinística de 50/128 passos, preservando os pisos de sequência.

O relógio global impede reutilizar revisão de peça recriada, mas não basta
para detectar interferência quando a peça volta a ficar ausente. Toda edição
admitida, inclusive compensação, invalida os passos de outros autores daquela
peça. Essa marca pertence ao histórico limitado, sem mapa crescente de IDs.
Compensações próprias rebaseiam somente o próximo passo próprio compatível
da mesma peça para a nova revisão, sem alterar o antes/depois original. Assim
mover → pintar → desfazer pintura → desfazer movimento permanece possível,
enquanto a intervenção alheia não volta a ser válida ao restaurar aparência.

Compra/venda compensada usa o delta original sobre o saldo atual. Exigir as
permissões atuais do contrato original, `gastar` se a compensação debitar e
`gerir_financas` acima do limite; validar novamente conteúdo, colocação,
ocupação, rotas e apoios. A preparação deriva peça/região do passo selecionado
no servidor e a confirmação usa uma concessão vigente. Recibos confirmados
continuam respondendo antes de conferir a concessão, após a autoridade atual.

Projetar somente o próximo desfazer/refazer do próprio autor, incluindo valor,
disponibilidade, motivo e dados da prévia. Fotografia inicial e atualização
individual pelo ator devem usar o mesmo contrato. Mudança de histórico após
edição alheia também atualiza essa projeção; não transmitir a pilha completa
dos outros autores. A atualização segue a confirmação do diário e traz revisão
monotônica para o cliente recusar metadados atrasados. Na interface, preparar
e confirmar a compensação são gestos separados, com valor e conflito visíveis.

Este desenho ainda não é implementação ou evidência de aceite do histórico.

Arquivos: `morada-sim/src/{comandos/edicao.ts,sistemas/edicao.ts,dominio/fatos.ts,
dominio/reduzir-fato.ts,dominio/invariantes.ts,formatos/fotografia.ts}`;
cliente `modelo/editor-da-casa.ts`, `hud/EdicaoDaCasa.tsx` e testes do ator.

## Aceite dos incrementos

- Núcleo: exclusão mútua de peça/região, regiões independentes simultâneas,
  expiração com jogo pausado, renovação, permissão revogada, conexão substituída,
  geração velha, limite/contador e recusa sem dinheiro/ID/fato parcial.
- Histórico: undo/redo de compra/mover/pintar/venda, delta no saldo atual,
  interferência alheia, revogação, poda, ABA, mudança de conteúdo e migração.
- Ator: resposta perdida, diário indisponível, ACK perdido, queda antes/depois
  da compensação e nova posse, preservando exatamente um efeito financeiro.
- Navegador: duas contas adultas realmente convidadas pelo portal, sem alterar
  permissões no banco ou por depuração. `PERMISSOES_DE_QUEM_DIVIDE` já inclui
  decorar/gastar e exclui gerir finanças; aplicar o limite de 500 M$ também aqui.
  Mostrar bloqueio, liberar ao sair/reconectar, permitir edições independentes,
  desfazer apenas operação própria e conservar tudo após restauração.
- Seis gates públicos e prova privada de arte completa; rever capturas de
  computador/celular. Esses gates não comprovam diversão humana ou 60 FPS.

Construção estrutural, casas/orçamento e demais lotes continuam no plano D3.

## Regressão de reconexão

Inspeção do ator encontrou a fila de `caiu` identificada somente pelo SID.
Uma reentrada com o mesmo SID pode terminar antes do próximo passo processar
essa queda antiga. O teste `reconexao-enfileirada.test.ts` provoca uma/três
quedas e reentradas antes do passo, depois verifica comando, presença e reserva
além dos 30 s de graça.
O workflow focado `morada-reconexao.yml` evita repetir navegador/100 dias para
reproduzir essa hipótese; o conserto volta aos seis gates antes de integrar.

Hipótese reproduzida em `1b88f4d7`, execução `43777623906`: os dois casos
falharam depois da reentrada, devolvendo recusa no comando da sessão nova.
Correção: ao consumir `caiu`, conferir se já existe uma conexão vigente para o
SID antes de marcar a presença em graça. As três regressões passaram em
`43778006421`. O hotfix isolado `18f52aa` preservou Mundo V2/protocolo 1, passou
seis gates na candidata `43778361615` e na main `43779266639`, e foi implantado
no Railway. Detalhes e confirmação de saúde no [registro](reconexao-2026-11-15.md).

## Implementação do histórico, ainda sem comandos de compensação

A base `a264bd79` passou tipos e sete casos próprios do histórico no GitHub
`43793575922` (26 casos do núcleo e 14 do cliente no conjunto focado). Retém
50 passos por autor e 128 no mundo, não inclui ocupantes/revisões antigas e
conserva o delta original. Interferência alheia não se torna válida ao retornar
à mesma aparência; ações novas encerram apenas o refazer do próprio autor.

O incremento seguinte inclui `historicoDaCasa` no Mundo V3 **ainda não
publicado**, iniciando vazio na migração V2→V3. O redutor deriva cada passo do
fato financeiro já admitido e o aplica na mesma cópia validada que saldo,
peça e recibo. Repetições/recusas não criam passos; uma edição sem mudança só
atualiza a âncora. A restauração exige formato, ordem, limites, identidade,
vínculo familiar, sequência do autor e revisão global coerentes. Não tenta
reconstruir ações antigas a partir de uma janela de recibos podada.

Esse registro e seus testes não entregam desfazer/refazer ao jogador. Faltam
admissão da compensação com permissões/valores/espaço atuais, reserva, diário,
metadados individuais e interface, além das provas de queda e de duas contas.

A persistência `0f0f1cd4` passou os seis gates públicos em `43794316689`.
O incremento de compensação usa `operacao.t=compensar`, com somente a chave,
o sentido e as revisões esperadas. O host deriva a peça e o delta da origem;
não recebe valor ou fotografia do navegador. Cada compensação usa nova
sequência financeira, revisão global e reserva, e o redutor confere novamente
a origem antes de admitir a mudança na cópia atômica. Permissões originais,
gasto quando houver débito, saldo e colocação atuais continuam obrigatórios.

O ator fixa os metadados de cada autor no passo pendente e só os transmite
depois do diário. A projeção contém apenas os próximos passos próprios de
desfazer/refazer. O cliente conserva a revisão mais recente diante de ACK
antigo e exige conferir uma prévia/valor antes de confirmar. Testes adicionados
exercitam a cadeia de quatro operações, repetição, interferência, falta de
permissão/saldo/trava e quedas antes/depois do diário em ambos os sentidos.
Esse incremento ainda precisa de validação remota e jornada real no navegador.

Fonte `188bbb46`: tipos e prova focada `43795640707` passaram: 51 casos do
núcleo, 29 do cliente e 10 do ator. Inclui quatro quedas de compensação (dois
sentidos × antes/depois do diário) e reenvio com a geração da instância antiga.
O E2E de duas contas foi ampliado para conferir que a autora vê somente o
próprio histórico, desfazer/refazer com aceite explícito, saldo/quantidade e
persistência após nova parada/retomada. Os seis gates e a arte dessa ampliação
ainda não foram executados.

Fonte `7f0c5e33`: prova focada `43796227280` aprovada (53 núcleo, 30 cliente,
10 ator). Na rodada completa `43796395041`, qualidade, integração, versões,
simulação longa e E2E passaram, inclusive a nova jornada de desfazer/refazer
e restauração por duas contas. O gate do cliente falhou no orçamento:
1.255.477 bytes de JavaScript, teto 1.250.000; gzip 347.329, teto 360.000.
Não declarar seis gates aprovados para essa fonte.

A construção dos schemas de fotografia estava no módulo dos helpers do
histórico e entrava nas importações do cliente. A correção separa o validador
em `formatos/` e declara a ausência de efeitos externos do package puro para
permitir eliminar módulos não usados. O teto não foi aumentado, nem recursos
ou validações do servidor removidos. Uma etapa focada passa a medir o mesmo
bundle antes da nova rodada completa; redução ainda precisa ser conferida.

Primeira medição após separar o schema (`d52a3436`, `43797274412`):
1.251.075 bytes, 346.196 gzip. Redução observada de 4.402 bytes, ainda
1.075 acima do teto. Outra dependência desnecessária foi identificada:
ler a versão do formato importava a fotografia, e gerar a chave financeira
importava todos os schemas de operações/recibos. Versões e identidade passam
a módulos próprios, mantendo as mesmas validações da chave e os mesmos
exports públicos. A nova medição continua obrigatória.

Em `3b187f2f`, o peso permaneceu em 1.251.099 bytes (gzip 346.208): a
dependência ainda existia por outro caminho. `protocolo.ts` construía o
parser de entrada ao fornecer as constantes usadas pela conexão. Constantes,
schemas de entrada e tipos de saída passam a módulos internos distintos,
preservando os mesmos exports públicos e o parser completo no host. Não usar
esse resultado acima do teto como aprovação de desempenho.

Fonte `cef54710`, prova focada `43798035904` aprovada: **1.246.670 bytes**,
**344.650 gzip**, página da marca **2.974 bytes**. Teto preservado; a redução
observada desde `7f0c5e33` é 8.807 bytes. A próxima rodada completa também
inclui uma prova do ator inspecionando os quadros individuais da convidada,
inclusive depois de reconectar, e os estados intermediários da cadeia de
compensações. Não bastava um botão desabilitado para provar ausência de
histórico alheio na rede.

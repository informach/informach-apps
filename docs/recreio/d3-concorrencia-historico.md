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

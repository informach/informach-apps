# Recreio: convites dirigidos e aprovações

Incremento de F5, subordinado ao fechamento web autorizado. Este plano não
declara implementação ou ativação. Mantém os códigos adultos existentes no
seu contrato e prazo; não os reinterpreta como aprovação para menores.

## Persistência e integridade

Convite dirigido tem registro próprio, sem código transmissível. O destinatário
é um perfil conhecido por amizade atualmente autorizada; o servidor determina
contas, papéis, políticas, gerações e participação existente. UUID da tentativa
é único por emissor e vincula o corpo canônico. Resposta perdida recupera o
mesmo recibo durante trinta dias; não existe retry automático. O convite vale
até 24 horas. Tabelas de aprovação do mundo e do responsável são distintas.

O convite guarda revisão de gestão, de amizade e das políticas observadas.
Qualquer mudança exige convite novo, sem restaurar aprovação por retorno de
perfil, aparelho, amizade ou papel. A proveniência do emissor é a participação
do próprio perfil naquele mundo, com FK composta. IDs de origem/destino não
podem desaparecer por uma exclusão indireta: F7 revoga e elimina esses recibos
antes de desvincular a identidade, conservando os membros e o progresso.

Este primeiro contrato admite somente membro. Visitas terão concessão separada,
prazo e SID do anfitrião, além de negociação de SDK/host; não usar participação
permanente temporária. O servidor recusa visita enquanto esse incremento não
estiver implementado e homologado.

## Autoridade e ordem das travas

1. Emissão/aceite usam a autoridade real de jogo (cookie de jogador ou SID),
   cobertura e classificação atuais. Composição das contas das duas pontas é
   travada em ordem antes do mundo e dos perfis. Releitura após esperar é
   obrigatória; recalcular política confirma sua invalidação antes da recusa.
2. Responsável ou coadministrador adulto pode convidar. Membro segue `no`,
   `with_approval` ou `yes`. Em `yes`, participação só é direta quando coincide
   com o identificador já atribuído ao membro e não é nula; um texto enviado
   pelo cliente nunca comprova propriedade da família do jogo. Novo espaço de
   participação exige aprovação do mundo. O jogo continua validando sua regra.
3. Aprovação do mundo exige adulto nativo atual com papel válido, ou responsável
   atual pelo perfil menor que é responsável pelo mundo. Compõe também essa
   terceira ponta antes das travas. Compra ou grupo não concedem papel.
4. Todo perfil menor envolvido exige aprovação nativa recente do responsável
   atual, vinculada ao vínculo, geração e política observados. É independente
   da amizade aprovada e da decisão do mundo. O adulto não precisa de jogador.
5. Aceite relê amizade e bloqueios nas duas pontas, aprovações, revisão de
   gestão, papéis, perfil/aparelho, política e conteúdo/lotação. O destinatário
   é o perfil atual da autoridade, nunca um campo de identidade do pedido.
   Reingresso conserva o ID do membro e exige convite posterior à saída.

Recibos, aprovação, aceite e auditoria são atômicos. Releitura do relógio no
fim impede que uma espera na auditoria atravesse o prazo. Transferência,
remoção, rebaixamento do emissor, arquivo e moderação revogam convites ainda
não aceitos. Bloqueio impede emissão/aceite mesmo antes da manutenção.

## Superfícies e verificação

Contratos portáteis/SDK em `packages/recreio`; serviços, repositories, ações e
rotas no app. A entrada de destinatário nasce da lista de amigos autorizados,
sem busca pública. Portal/host mostram pendência, validade e confirmação
explícita; a área nativa oferece decisões do mundo e dos menores. Uma falha de
resposta manda conferir o recibo e não simula rollback ou aprovação.

Provar no GitHub: amizade revogada/bloqueada antes e durante o aceite; política,
geração e responsável trocados; aprovação parental sem papel no mundo e vice-
versa; membro tentando participação alheia; duas aceitações/última vaga;
saída/remoção/transferência/arquivo concorrentes; SID de outro jogo ou encerrado;
nonce reutilizado com outro corpo e resposta perdida; falha real de auditoria;
expiração durante trava e depois da auditoria; duas contas e menor pareado no
título interno Livre. Migrations geradas no GitHub e upgrade com dados. Antes
de produção, concluir também moderação, retenção, direitos e fontes operacionais.

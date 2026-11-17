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

## Geração e revisão da fundação

O artefato `14380776251`, run `44198406955`, origem `57cd67fd`, foi **recusado
antes da cópia**. Seu SQL 0193 criava a FK de proveniência antes da restrição
única de `space_members` referenciada por ela. Não editar o SQL para reordenar.
Gerar primeiro somente a restrição composta, a partir do snapshot 0192; depois
restaurar a exportação das três tabelas e gerar a migration seguinte, que já
encontrará a chave no schema anterior. Os arquivos desse artefato recusado não
entram no checkout ou em produção. As tabelas ainda não têm escritores nem
leitores publicados. Aprovação depende dos dois artefatos conferidos, banco
descartável e upgrade com dados no GitHub.

Predecessora correta gerada em `44198889651`, origem
`e4d99d4cb26ebcde4c9b96d5c9b753a057f1ec02`, artefato `14379858339`.
ZIP `de8d3f3811b31c70706c3060039524ab9c95d8bdd5a2b381aa2cdf8930becc12`.
Conferidos origem, allowlist, bytes e SHA-256 antes e depois da cópia intacta:

- `0193_careless_gladiator.sql`, 131 bytes,
  `188aa8a306f70867b5ffafade098f7bc3c7937d8b85c7538ca3df4a7dc69ad3a`.
- Snapshot, 853543 bytes,
  `2c1faaa59095d924cddf00d1827d7853b2c8981734b0cd563198fecca3f490e2`.
- Journal, 29345 bytes,
  `7b62a627a8b1cdce208aef2035f95ad1f35e3802b1804722a205fdeb3ca83eee`.

SQL contém somente a restrição única composta da tabela existente, cujo volume
de produção é pequeno. As três tabelas retornam à exportação para gerar 0194.
Ainda não executar migration isolada ou publicar como fluxo de convite pronto.

0194 foi gerada no run `44199344843`, origem
`59f3495d71f0de3cc64adf10a795e7982009443f`, artefato `14379468637`.
ZIP `1be7fd81fbfa2e3fbc9f8b3cd70fa4b7dd3ba53ef30b7702f258cf99839bde6d`.
Cópia intacta conferida antes e depois por bytes e SHA-256:

- SQL `0194_funny_photon.sql`, 8252 bytes,
  `2f543ff2b6771af2143d8a120c7b1bc3ddb5b98da4bc31292b17c43b355c2977`.
- Snapshot, 872993 bytes,
  `3b8ec3ddb47ad47cb37d86235901a72058e6d31af1cdab396371685526259f8d`.
- Journal, 29487 bytes,
  `645234b6fa61df855928462b9f0998960fbf5d49af8ead76865378f8070428b6`.

A revisão também exige proveniência da aprovação do mundo feita por responsável
de um menor que detenha o mundo: vínculo, geração e versão da política ficam no
recibo. Conferir só o adulto atual permitiria reaproveitar aprovação anterior a
uma revogação e retorno da mesma pessoa. Esses campos entram em geração aditiva
posterior, antes de qualquer escritor publicado; não editar 0194 gerada.

0195 gerada no run `44201183378`, origem
`11ae500e0135283b05be6addbe2ae6aa72bf5b20`, artefato `14381307675`.
ZIP `9c209a772426fc9577c300c38caa101b46d73349a10bf5a8aa786e4e86981c1c`.
Os três arquivos foram conferidos e copiados intactos:

- SQL `0195_workable_wendell_vaughn.sql`, 1561 bytes,
  `8489518d2804af96f0aa4c175affc84e2e665753da05053057634b0e8632277f`.
- Snapshot, 874625 bytes,
  `ff20c1779de4bc0b1f727c30e5c34697ff8aeb7dd7009b3288d98e05f3ae9276`.
- Journal, 29640 bytes,
  `9ff90f8ab2aebe6b99ba74875e4714428ccf3a0e9ff99451a520418e6fbdc94a`.

A geração das duas pontas também pertence ao convite original. Renovar uma
amizade parental não incrementa sua revisão; por isso esse número sozinho não
invalida o convite anterior à desconexão de aparelhos. A geração de cada menor
é capturada na emissão e comparada antes de aprovar/aceitar. Migration aditiva
seguinte, sem backfill inventado: raiz antiga sem geração não pode autorizar
menor. Nenhum escritor dessas tabelas foi publicado ou ativado.

# F7 — corte de escritores e execução de direitos

Estado: plano técnico do incremento seguinte. Nenhum congelamento, consentimento
destrutivo ou encerramento foi ativado. Prévia e adapter isolados não bastam.

## Escopo e descoberta

O SHA continua autenticando o plano completo persistido. A comparação para
consentimento deve conferir pessoas, responsabilidade/versão e vínculos/gestão
dos mundos. Revisão de fotografia, diário e cerca são recapturados sob trava;
progresso automático não exige novo consentimento a cada checkpoint.

Uma visita pode deixar autoria sem criar membro. `profile_world_traces` registra
a ligação perfil/mundo na mesma transação da admissão real, tanto de membro
quanto de visitante. Não concede acesso, não é presença pública e não expira
com SID/convite. O plano combina esse índice com autoria, responsabilidade e
membros históricos. Falha de auditoria/autoridade reverte também o índice.

Antes da ativação, conferir origem legada: produção mantém visitas desligadas,
mas configuração atual sozinha não prova que não houve referência antiga.
Conferir autores nos dois mundos/fotografias/diário existentes contra os vínculos
descobertos; qualquer referência sem origem exige resolução explícita. Não
inventar backfill silencioso em startup nem declarar índice completo só por DDL.

## Consentimento e barreiras

1. Carregar configuração/chaves privadas fora das travas. Descobrir o escopo e
   preparar a prévia sem tomar posse ou produzir efeitos destrutivos.
2. Na confirmação, travar operação → mundos ordenados → contas/perfis/vínculos
   na ordem nativa. Reconsultar a descoberta; mundo novo ou autoridade alterada
   recusa a confirmação, sem tentar adquirir outro mundo depois do perfil.
3. Resolver responsabilidade de menores e sucessão de mundos com terceiros
   antes de consentir. Não fabricar aceite nem apagar progresso compartilhado.
4. Persistir consentimento recente, intenção externa assinada e bytes exatos,
   junto com as barreiras. Publicação passa a ser recuperável/irreversível;
   cancelamento da prévia não cancela uma intenção já preparada.
5. Perfil: suspender gameplay, incrementar versão e cortar credenciais/SIDs.
   Mundo: encerrar posse, aumentar cerca e arquivar durante a transformação.
   Antes disso, exigir checkpoint durável com o host pausado ou mundo já
   hibernado: retirar a posse de um mundo sujo não é prova de preservação de
   progresso. Se o host publicado não negociar essa coordenação, implementar
   o incremento mínimo compatível ou manter a execução em pendência; não
   promover formato D3 nem considerar só a foto periódica como confirmação.
   Não reaproveitar suspensão como única barreira: um writer de gestão antigo
   não pode reabrir o perfil/mundo enquanto o pedido estiver em execução.
6. Proposta de barreira de banco: operação por FK RESTRICT e projeção exata
   dos campos de conteúdo/autoridade congelados, com CHECK. Alteração comum
   desses campos falha fechada; somente o executor atualiza a projeção junto
   com seus efeitos. Datas técnicas sem autoridade podem avançar. Não restaurar
   versões, credenciais ou cercas antigas ao retomar.

## Efeitos e recuperação

Admitir a intenção no livro externo antes de qualquer efeito irreversível.
Executar etapas pequenas, com recibo local/lease e auditoria atômica; I/O fica
fora das travas e sua resposta precisa ser relida antes de publicar ponteiros.
Um pedido falho não impede atender os próximos. O estado mostra pendência real.

O adapter retira identificadores/textos atribuídos em estado validado e conserva
o formato antigo. Ainda é preciso materializar diário, tratar todas as fotos,
resumos/nome do mundo, permissões/convites e objetos/arquivos retidos. Reabrir
para os demais só depois de impedir que uma capacidade antiga recoloque dados.
O perfil só pode ser removido depois da limpeza de todos os mundos e de seus
demais domínios; cobrança, auditoria/retenções e identidade global são separados.

Restauração permanece sem tráfego até verificar livro congelado, aplicar todas
as intenções admitidas, comprovar efeitos nativos e renovar autoridades/chaves
atuais. Recibo do consumidor sintético e SHA de uma cerca não autorizam o corte.


## Sequência restante da execução nativa

A operação deve guardar ID/revisão da prévia, conta/tipo/SHA, consentimento e
autenticação, livro/época/kid/fonte e bytes assinados exatos antes de I/O.
Estados de publicação/admissão/execução/conclusão/revisão e lease/tentativas
permitem retomar resposta perdida sem repetir consentimento ou efeitos.
Perfis e mundos conservam referências históricas por operação, com recibos de
etapa; nomes, projeções e bytes privados não entram na auditoria.

As projeções congeladas abrangem campos de conteúdo e autoridade, incluindo
status, versões, titulares/vínculos, nome/resumo e revisões/cerca. Timestamps
técnicos ficam fora para evitar dependência de timezone e atualizações sem
efeito de permissão. O CHECK também exige suspenso/arquivado e par consistente
entre operação/projeção, com FK RESTRICT. Testar alteração direta por writer
antigo, unarchive/reativação, novos vínculos durante espera e rollback de
auditoria; o executor muda a projeção atomicamente com o próprio passo.

Admissão de visitante e de membro ocorre nos dois gateways que ligam o SID
ao mundo; criar um SID ainda sem mundo não cria rastro. O índice é gravado
no mesmo commit e conflito somente do par perfil/mundo preserva o registro
original. Qualificar sucesso, repetição, recusa, saída e falha de auditoria.

Depois das barreiras: publicar/admitir no livro, materializar estado e diário,
preparar/validar fotos e efeitos, retirar ponteiros/capacidades antigas e limpar
as dependências nativas antes de remover o perfil. Retenções justificadas de
financeiro/auditoria/backup devem ser explícitas no plano/recibo, com política
e prazo próprios; não chamá-las de anonimização. Arquivo legado ambíguo ou
adapter indisponível mantém pendência, sem conclusão fictícia.


Encerramento do Recreio requer participação nativa encerrada separada da
identidade global: pagante sem jogador não pode parecer uma conta nova e
reiniciar teste/histórico. A gestão financeira e os recibos de direitos devem
continuar acessíveis pelo próprio adulto, sem reabrir gameplay ou concessões.
Retomada é decisão explícita e não restaura credenciais/versões antigas.
Planos financeiros ainda vigentes e cobertura dos demais perfis devem ser
resolvidos conforme o contrato, sem apagar seus históricos ou fabricar aceite.

A migração da primeira intenção destrutiva fixa uma fronteira de rollback:
não voltar a um portal que desconheça participação encerrada e barreiras.
Qualificar a fonte de retorno compatível antes de ativar o executor. O servidor
do jogo pode exigir backport mínimo sobre a fonte publicada, com formato V2
preservado e negociação desligada até o portal estar pronto; não trocar seu
runtime implicitamente pela candidata D3 da main.

## Candidata de barreiras persistidas

Schema acrescenta outbox de operações com intenção assinada exata, vínculo composto
à prévia/conta/tipo/SHA, estados distintos de publicação e execução, lease e prazos.
Recibos por perfil e mundo conservam referências históricas sem cascata destrutiva.
As projeções privadas dos perfis e mundos têm CHECK e FK RESTRICT; só aceitam
suspenso/arquivado, recusam par parcial com NULL e abrangem conteúdo/autoridade.
createdAt e archivedAt entram por epoch numérico, independente do timezone;
somente updatedAt fica fora. A cobertura tipada obriga revisão ao adicionar campos.

Esta etapa ainda não é executor nem ativação: CHECK não substitui autorização
nativa, coordenação dos mundos, revalidação de dependências ou admissão no livro.
As seis provas PostgreSQL novas verificam writers antigos, NULL, referências,
retomada de passos e conservação histórica. A geração do DDL e os gates serão
remotos antes de qualquer adoção/implantação.

## Consentimento e publicação nativos em candidata

Núcleo de retirada individual reusa a composição nativa: contas ordenadas antes
dos mundos, depois perfis, vínculos e aparelho; isto corrige a proposta inicial
de mundo antes da conta, incompatível com os gestores atuais. Reconstitui a
prévia sob trava, confere responsabilidade/login recente depois das esperas,
recusa novo mundo e exige transferência aceita quando há outros participantes
sob gestão do perfil retirado. Repetição do mesmo consentimento devolve a mesma
operação/bytes, sem incrementar versões nem emitir auditoria duplicada.

O passo recusa posse/sessão de mundo aberta, mundo ativo ou diário além da
última foto. Suspensão, cerca, projeções, recibos e intenção assinada são
atômicos com a auditoria; não apaga foto, perfil, identidade ou cobrança.
Ainda sem action/rota pública de exclusão, até concluir executor/dependências.

A outbox reserva um item com lease, verifica intenção/plano/sujeitos, sai da
transação e concilia o prefixo inteiro antes de publicar por CAS. Intenção já
admitida, mesmo anterior à última cabeça, não duplica a cadeia após crash.
Token/prazo cercam o commit nativo; erro/resposta perdida desse commit não
vira falso erro de provedor. Integridade fica em revisão, falha transitória
adiada não impede os demais. Admissão não é conclusão nem autorização de
restauração/tráfego. Worker não executa efeitos de exclusão neste estágio.

O primeiro DDL gerado 0226 foi rejeitado no PostgreSQL: FK emitida antes da
nova UNIQUE. Artefato preservado como rejeitado; nada foi aplicado em produção.
Regenerado sem edição manual: 0226 cria a UNIQUE, 0227 acrescenta operações,
recibos e barreiras. Snapshots/journal e hashes adotados intactos dos Actions.

## Processamento de fotografias em candidata

Worker operacional fora do Next confere o prefixo do livro e os bytes assinados
contra plano/seleção nativos. Reserva uma foto retida por passagem, inclusive
as fixadas, com lease por operação e cerca do mundo. Lê/materializa e transforma
fora da transação. O commit entra primeiro pela barreira comum de captura/GC,
revalida token/prazo/mundo/foto/cursor, desvincula a entrega antiga preservando
lease/holds de PUT em voo e grava bytes PG novos com cursor/auditoria atômicos.
Não muda ID, formato, revisão, tick, diário ou espécie fixada da foto.

Resposta perdida do commit é resolvida pelo cursor persistido na passagem
seguinte. Foto inválida fica em revisão, sem avançar nem reabrir o mundo.
Concluir as fotos leva só à etapa de dependências: diário, resumo/nome do mundo,
referências/capacidades nativas, objetos retidos, perfil e retenções continuam
pendentes. Não há operação completa nem liberação pública da retirada.

A fonte b9f73f68 passou qualidade em 44548601200. A integração 44548609154
aplicou 0226/0227 e passou 1347 casos; um teste esperava 23503 na exclusão
RESTRICT, mas PostgreSQL 18 devolveu 23001, conservando os registros. Corrigida
a expectativa estrita para o código observado, sem alterar a proteção. A nova
rodada inclui processamento real de fotos, preservação de outro perfil/formato,
rollback de auditoria, token vencido e recusa de livro congelado.

## Resumo regenerado e prefixo coberto do diário

Nova candidata compartilha a projeção pública do estado entre o servidor Morada
e o adapter de direitos, sem mudar seu contrato. A última foto tratada atualiza
o resumo/projeção congelada no mesmo commit; títulos pessoais da fundação não
ficam na cópia do portal. A fila avança nextAttemptAt ao concluir cada foto,
para uma operação com muitas fotos não monopolizar as passagens.

Depois de todas as fotos, a compactação remove lotes de até 100 entradas do
diário que a última fotografia já materializou. Confere prefixo/assinatura,
barreira/cursor e SHA do corpo PG atual; recusa qualquer entrada além da
cobertura. journalSeq e revisões não voltam a zero. A próxima abertura usa a
última foto e lê apenas seq maior que ela; fatos individuais não são reescritos
com autoria falsa. Fotos históricas/fixadas tratadas continuam presentes.
Recuperação anterior à retirada continua obrigada ao replay do livro antes do
tráfego; não oferecer reconstrução do diário pessoal compactado.

Isto ainda não conclui vínculos, nome do mundo, objetos/retencões ou remoção
final do perfil. A execução permanece interna/candidata, sem ativação pública.

A candidata 59113f71 passou os 1352 cenários PostgreSQL (106 arquivos), os
16 de captura e cinco HTTP em 44550763912. O gate de upgrade revelou que a
comparação integral antiga incluía as duas novas colunas nulas; a projeção
agora conserva todos os campos antigos e verifica separadamente que barreiras
e operações novas continuam vazias. Não ignorar colunas novas sem essa prova.

O CI compartilhado dessa fonte encontrou acoplamento indevido do preparador
binário ao env completo do portal. O preparador e sua prova usam agora somente
o limite canônico do Morada em @informach/config/jogos; não recebem env fictício
ou mock de login/e-mail para conseguir ler bytes. O CI da fonte anterior aa95
concluiu com sucesso em 44535164045, sem qualificar automaticamente esta mudança.

## Referências técnicas durante retenção

Presenças, visitas e convites dirigidos já têm retenções técnicas delimitadas
no schema (até 30 dias após seu marco próprio). Não reiniciar esses prazos
quando chega um pedido de direitos. O executor deve retirar imediatamente
cadastro/conteúdo/capacidades e manter, quando a FK de segurança ainda exigir,
somente referência suspensa sem login, grupo, cobertura, nome ou avatar pessoal.
Isso é minimização com retenção, não anonimização. A auditoria segue a política
central de cinco anos e financeiro/identidade global continuam separados.

Schema candidato acrescenta fase/política/data de minimização e prazo de
retenção ao recibo do sujeito, com coerência de NULL/estado e remoção final.
A exceção de adulto sem login exige operação vinculada, suspensão, grupo nulo,
cobertura desligada e rótulo/avatar genéricos; CHECK da projeção continua
impedindo writer antigo. Não autoriza criador de perfil a emitir essa referência.
Ainda faltam o minimizador, expurgo por prazo, recibo final e telas/retensões
completas. Gerar/qualificar esse DDL remotamente antes da adoção.

## Gates e revisão da fila

2a7acd8b concluiu os dezesseis gates em 44552782455: 1354 integrações/106
arquivos, 16 captura, cinco HTTP, 253 simulação e upgrades 179→228/191→228
preservados. Recibo estruturado em evidencias/rodada-direitos-44552782455.json.
Isso não qualifica automaticamente o incremento seguinte ou produção.

0228 foi gerada/adotada intacta em 44554233226, 229 recibos na candidata.
A primeira integração 44554917115 passou 1355 e falhou em um caso de parâmetro
polimórfico de jsonb_build_array: recebeu 42P18 antes de atingir o CHECK.
A função de projeção compartilhada agora fixa os tipos PG de todos os campos,
em vez de aceitar esse erro no teste. Gerar a alteração dos dois CHECKs intacta.

Passos SQL de diário/cadastro ganham lease durável antes da transação de
efeitos. Erro de integridade entra em revisão automática auditada; erro inesperado
continua falhando o job, com próxima tentativa adiada sem refazer o consentimento.
Isso permite atender outros pedidos e preserva rollback/origem do erro.
Conteúdo pessoal é retirado em lotes de 100 sem carregar BLOBs, buscando versões
pelo índice da chave e mantendo o conteúdo dos demais perfis. A minimização
final do cadastro ainda é outra etapa. A chave ativa do worker também precisa
coincidir com a cabeça verificada, inclusive ao reconhecer intenção histórica;
um writer da época antiga não pode continuar após rotação.

## Fechamento de mundos ativos ainda a implementar

A recusa de mundo em uso é segura, mas não basta para a plataforma final quando
outros continuam jogando. Próxima coordenação deve admitir intenção, bloquear
novas entradas e encerrar SIDs do mundo pelo cursor já existente. O host atual
recebe esses encerramentos, fotografa ao ficar vazio e libera a posse. Só após
confirmar esse salvamento e sua cobertura a operação passa à projeção congelada
com cerca nova. Enquanto drena, preservar escritas finais do host autorizado;
não arquivar/congelar contadores antes de seu checkpoint. Estado inconsistente
ou host perdido com diário pendente permanece recuperável, sem descartar
progresso. Isso é contrato da plataforma/host; não exige publicar o jogo D3.

## Minimização e expurgo são etapas distintas

O recibo de sujeito acrescenta purging para a referência já minimizada sem
retenção futura, aguardando somente expurgo mecânico. Minimized continua
exigindo prazo futuro original: não inventar um prazo novo para satisfazer
constraint ou reiniciar os 30 dias. Removed mantém a prova da eliminação
física, com hora posterior ao prazo quando houver. Esta ampliação não modifica
linhas anteriores, conserva os CHECKs dos estados existentes e deve ter DDL
gerado/qualificado antes da adoção.

A fonte 812a861c passou integração 44558447327: 1359 cenários/107 arquivos,
16 captura, cinco HTTP e upgrades 179/191→230 preservados. Qualidade de
762718cd também concluída. Minimização, expurgo e drenagem continuam pendentes.

## Minimizador candidato

Após fotos/diário/dados pessoais, a etapa nativa elimina cadastro, nascimento e
responsabilidade do menor, retira associação comercial do jogador e conserva
uma referência suspensa sem login/nome/avatar. A conta continua acessível ao
adulto, inclusive com zero jogadores. Não limpar minorContextGeneration de
outro aparelho que ficou em contexto infantil. Recibos de convite familiar
são desvinculados antes de retirar o user_id, preservando seu fato de aceite.

Convites pendentes do perfil são revogados antes de qualquer SET NULL do alvo;
participações e rótulos atribuídos ao perfil são retirados. Membros que já
saíram conservam leftAt e não exigem transferência impossível; suspensos/away
ainda têm direitos e exigem responsável aceito. Mundos dos demais conservam
estado, responsável e posse cercada; rótulo do mundo criado pelo perfil é
substituído. Mundo com outro responsável/criador não vira excluído só porque
a contagem de membros está vazia. A liberação acontece no mesmo commit dos
recibos, após o tratamento dos bytes. Nenhum ingresso antigo volta a valer.

O prazo técnico é o máximo original de presenças e convites, calculado com
precisão PG; não é agora + 30 dias. Sem prazo futuro, purging distingue
expurgo mecânico. A etapa e os CHECKs novos ainda precisam de gates remotos,
seguida do purgador/finalizador, drenagem de mundo ativo e tela de execução.


## Expurgo e conclusão candidatos

O purgador retoma a referência histórica exata, confere a intenção assinada e
seu prefixo externo e exige o cadastro canônico já minimizado. Trabalha também
sobre operações concluídas com retenções explícitas, sem lhes atribuir lease
ou alterar a data original de conclusão. Referências técnicas ainda vivas ou
com prazo original futuro bloqueiam o DELETE; não há extensão automática.
Também conservamos até o vencimento original o SID encerrado pelo cursor,
para que retirar o cadastro não suprima prematuramente a revogação.

A ordem dos lotes respeita as FKs de sessões visitantes, visitas, convites,
presenças, amizades/pedidos/códigos e sessões de jogo. Cada passagem remove
até cem pais/linhas de um domínio, não carrega fotos ou conteúdo e não chama
rede sob locks SQL. Índices de histórico cobrem os caminhos que antes só
indexavam relações pendentes/ativas. Auditoria estrita e alteração do recibo
removed integram a mesma transação do DELETE. Falha reverte o efeito e
reagenda só o item para dar passagem às demais operações.

A conclusão da retirada exige todos os mundos liberados e cada sujeito
removido ou minimizado com prazo original ainda vigente. Informa retenções
em separado, conserva identidade e fatos financeiros e não alega anonimização.
O expurgo posterior não reabre a operação nem reescreve seu recibo de conclusão.
O índice de mundos do perfil é retirado na minimização, depois dos recibos dos
mundos; nenhum índice novo pode surgir em perfil suspenso.

Qualidade da correção de contexto infantil passou em 44570280421 (1aaa1618);
a integração correspondente ainda está em conferência. Os novos lotes,
conclusão, token com prazo real e índices precisam dos gates remotos da
próxima fonte. Não há rota pública destrutiva, migração ou ativação em produção.


## Executor operacional candidato

`pnpm --filter @informach/recreio-app processar-direitos` executa uma passagem
por publicação, fotos/diário, dados, cadastro, referências e conclusão. Não
aceita argumentos ou IDs arbitrários. `RECREIO_RIGHTS_MODE=off` é o padrão;
`process` exige escopo, livro, bucket privado, endpoint oficial permitido,
região/path-style, credenciais exclusivas, chave ativa, keyring em array de
pares `[id, base64]` e a política `retirar-textos-fundacao-v1`. Nunca imprimir
as variáveis. O livro deve existir e ser conferido: ausência não inicia um novo.

Os nomes são `RECREIO_RIGHTS_SCOPE`, `LEDGER_ID`, `BUCKET`, `ENDPOINT`,
`REGION`, `PATH_STYLE`, `ACCESS_KEY`, `SECRET_KEY`, `ACTIVE_KEY`, `KEYRING`
e `POLICY`, todos com prefixo `RECREIO_RIGHTS_`. Qualificação só usa bucket
recreio-homologacao ou recreio-homologacao-*; produção recusa esses buckets.
O parser recusa IDs/bits repetidos e base64 não canônico, sem expor valores
em erros. Buffers próprios são apagados e o cliente S3 é encerrado, inclusive
se a composição falhar. A credencial precisa de escopo comprovado no provedor;
a validação das variáveis não comprova essa permissão nem custódia externa.

A rodada tenta etapas independentes e retorna falha se qualquer etapa falhar,
entrar em revisão ou se houver revisão anterior. A fila mede contagens sem
conteúdo e recusa sucesso quando há processamento pendente há mais de trinta
minutos ou expurgo vencido há mais de cinco. Referências ainda no prazo são
contadas separadamente. O job `recreio/direitos` usa ops.job_runs, e a saída
contém somente etapas/situações e contagens; erros públicos são constantes,
sem SQL, parâmetros, bytes, chaves ou endpoints. Agendamento, alertas de cron
parado e permissão real do bucket ainda exigem implantação/homologação.

A geração 44571719480 (48b4fc0a) foi adotada intacta como 0231: cinco índices,
232 recibos, hashes/proveniência conferidos e nenhuma coluna/constraint/índice
anterior alterado. Qualidade apontou ausência dos três eventos novos na união
canônica de auditoria; corrigida sem casts. Integração da correção infantil
44570289673 passou. Expurgo/executor completos ainda estão em qualificação.


## Implementação da drenagem em curso

1. Acrescentar rights_draining no mundo e draining no recibo, conservando
   archived como barreira dos gateways atuais. A projeção de drenagem congela
   identidade/cerca/gestão, permitindo só schema/foto/diário/resumo do host.
2. Consentir e fechar todos os SIDs dos mundos pelo cursor nativo, sem revogar
   a posse atual antes do checkpoint. Perfis selecionados continuam suspensos.
3. Preservar archived na liberação da posse. A aquisição e as novas entradas
   continuam recusadas; não mudar o contrato público do host nem implantar D3.
4. Um passo nativo espera ausência de posse/SIDs e foto cobrindo todo o diário.
   Só então cerca a posse, congela contadores e habilita o adapter de retirada.
5. Testar gravação final real, preservação do progresso dos outros, recusa de
   gestão/entrada, falha do host/diário pendente e rollback estrito. Não apagar
   diário não coberto nem tratar expiração de lease como checkpoint.

A nova coluna nasce falsa e os recibos existentes conservam seus estados.
O upgrade compara todas as colunas antigas e prova a ausência do marcador
novo nos registros preservados. DDL será gerado remotamente; produção segue
inalterada. Recuperar um host perdido com diário além da foto exige caminho
próprio antes de liberar o mundo, sem descartar progresso.


A etapa candidata já encerra SIDs dos mundos pelo cursor nativo e permite o
checkpoint somente à posse que continua válida. Reivindicar/renovar essa posse
não reabre archived; liberar conserva o status até o tratamento coordenado.
O finalizador da drenagem confere foto/diário e ausência de posse/SIDs antes
de capturar contadores finais e incrementar cerca/gestão. Diário não coberto
após saída com erro vira revisão de dependência, preservando seus bytes.

0232 foi gerada em 44573813341 (2cc226d7) e adotada intacta: coluna falsa por
padrão e dois CHECKs, 233 recibos, SHA/proveniência e colunas/constraints antigas
conferidas. Ainda sem execução em produção. O executor inclui a etapa de
drenagem antes das fotografias; fotos/cadastro recusam tratar mundo drenando.

A fonte dbb06181 passou qualidade 44573168280. Integração 44573174515 passou
1372 cenários e identificou apenas colisão entre o hash fixo de um código
bystander do teste novo e outro arquivo da suíte. O novo teste agora usa hash
próprio, sem alterar a constraint ou o teste anterior. A rodada 44572112358
registrou a mesma colisão. Não registrar essas rodadas como integralmente verdes.


## Seleção consentida preservada fora do backup

O hash assinado sozinho não permite reconstruir o plano se o banco restaurado
for anterior à preparação. O publicador nativo passa a guardar o JSON canônico
original em planos/<SHA>.json, privado e imutável, antes de admitir a intenção.
A intenção continua autenticando seu SHA; o plano só tem os IDs, tipos,
versões, contadores e declarações de escopo já aceitos, sem nomes/e-mails.
O orçamento é separado: 256 KiB para o plano e 32 KiB para registros do livro.

A escrita exige If-None-Match, releitura exata, SHA, schema estrito e JSON
canônico. Leitura limitada recusa UTF-8 inválido, campos extras/duplicados,
compressão, ausência, corrupção e credencial recusada. Ausência nunca vira
plano vazio. O livro/prefixo e a chave atual são conferidos antes da escrita;
o plano não inicializa livro nem autoriza efeito sozinho. Objetos anteriores
são relidos na conciliação de uma publicação interrompida.

A prova real de bucket foi ampliada para treze objetos sintéticos próprios,
com plano privado vinculado à intenção da nova época, releitura no replay e
recusa anônima. Os treze devem ser removidos e a ausência relida. Ainda não
é reaplicação nativa num banco restaurado: o consumidor, quarentena e
normalização da autoridade atual continuam obrigatórios antes de tráfego.


A qualidade de 68442b57 passou em 44575466040. A integração identificou o
teste antigo ainda esperando recusa de mundo ativo e a fixture nova sem fato
no diário (sessão/tempo curto não garantem fato). Os testes passam a exigir a
nova barreira e a gerar um fato pelo comando real do motor, conservando o gate
contra perda do diário. Nenhum resultado integral verde foi declarado.

A primeira prova ampliada de bucket, 44576833907, foi recusada pelo guardião
local de caminhos do próprio ensaio, que ainda não admitia planos/<SHA>.json.
Todos os nove objetos sintéticos tentados foram limpos e a ausência confirmada;
nenhum dado/credencial de produção. O guardião agora admite exatamente esse
novo caminho dentro do mesmo livro sintético; não amplia bucket, prefixo,
LIST/DELETE ou permissões. A prova real precisa ser repetida.


A repetição real 44577680233 (bc62ea3e) passou quatorze propriedades e confirmou
limpeza dos treze objetos. Artefato original preservado fora do Git e recibo
derivado com SHA em evidencias/livro-plano-externo-44577680233.json. Produção,
credenciais da origem e efeitos nativos de restauração permanecem fora do ensaio.
Qualidade da mesma fonte passou em 44577667398; integração ainda em conferência.

A leitura de reaplicação candidata agora faz duas passagens sob a mesma cerca:
primeiro confere todos os planos, seu SHA e conta/tipo/perfis contra a intenção;
só depois chama o consumidor. Um plano final ausente impede inclusive o efeito
da primeira intenção. Orçamento cumulativo de bytes e prazo único impedem
carga sem limite; só um plano fica em memória por vez. Erro do consumidor é
preservado. Isso prepara o consumidor nativo e não substitui a quarentena,
normalização das autoridades ou a prova com banco restaurado anterior ao pedido.


A integração 44577672778 passou 1376 cenários e encontrou só a expectativa
HTTP do teste novo: mundo archived é MUNDO_INDISPONIVEL/409 no contrato
existente. O teste passa a exigir exatamente esse corpo/código, preservando
a recusa. Para iterar sem repetir oito minutos de toda a suíte a cada ajuste,
o workflow acrescenta verification_gate=rights, que roda os arquivos de
direitos com o mesmo banco isolado/migrations, sem credenciais reais. É gate
auxiliar, identificado como rights; all mantém seus dezesseis gates e continua
obrigatório antes de integrar/implantar. A rodada integral em curso anterior
a essa correção pode ser interrompida e repetida após o gate focado.


O gate focado 44579776354 passou 84 cenários PostgreSQL em sete arquivos,
fonte de6ea245, incluindo três de drenagem com o contrato HTTP real. Confirmou
checkpoint final mantendo archived, fonte cercada após salvar, progresso do
outro perfil e referências tratadas, diário preservado na saída com erro e
rollback estrito da cerca/recibo se a auditoria recusar. É prova focada; não
qualifica a rodada integral ou produção. Dezesseis gates e CI compartilhado
serão repetidos na fonte atual antes da integração.


## Recuperação de diário em implementação

Para a perda do host depois do commit de fatos e antes do checkpoint, a etapa
seguinte deverá: reservar a operação/mundo drenando sem posse aberta, ler a
foto e o sufixo contínuo sob limites de linhas/bytes, materializar fora do SQL,
reaplicar os fatos pelo motor e persistir nova foto antes de concluir a drenagem.
A confirmação deve revalidar hash/revisão/diário/cerca e lease do worker sob a
barreira de captura, operação e mundo, com auditoria estrita. Não compactar ou
alterar fatos antes de a foto nova cobri-los. Sem foto de base ou formato que
não possa preservar os dados, manter revisão explícita, sem inventar estado.

A inspeção encontrou JSON do diário convertido com `as Fato` no host. O novo
leitor candidato valida todas as variantes e entidades do fato, com schemas
estritos conferidos contra os tipos do domínio (Zod 4.6.7 já fixado). Recusa
campos desconhecidos, JSON ambíguo e dados inválidos com erro constante; conserva
as verificações nativas de sequência/ID/tick. Formato do jogo e protocolo não
mudam. Essa correção de integração não implanta D3–D8 e ainda exige gates dos
consumidores antes de publicação. A recuperação automática acima ainda não
está implementada; a revisão de dependência continua protegendo o diário.


O complemento candidato reaproveita lerMaterial/montarMaterial da recuperação
nativa, exigindo marcador de direitos e operação conferida sob lock. O CLI
ordinário mantém a recusa de mundo archived. Para o checkpoint mais recente,
o limite é o sufixo atual do catálogo; não herda a margem de cinco fotografias
históricas. A preparação é otimista: fora do SQL são materializados os bytes,
validados os fatos e refeita a foto, preservando V1/V2/V3. A confirmação sob
barreira de captura/operação/mundo relê a impressão completa antes de criar a
nova revisão com auditoria estrita. Duas preparações só permitem uma confirmação.

O executor recupera antes de concluir a drenagem. Foto e fatos originais ficam
preservados; a compactação continua somente após tratar todas as fotografias.
Fato inválido é revisão, erro inesperado continua falha, alteração concorrente
recusa publicação. Buffers próprios de foto aberta/comprimida são apagados,
sem modificar o argumento do chamador. Não há promessa de recuperar andamento
volátil que nunca entrou no diário. Falta a qualificação remota deste complemento.


O complemento dfd4f07e passou o gate focado 44585435042, incluindo recuperação
após falha do host, revisão de fato inválido e rollback da nova foto/auditoria.
A validação tipada dos fatos de 6171cfae passou qualidade 44581948063 e o gate
focado 44581954107. Seguem prova de concorrência otimista, recusa do CLI
ordinário e conferência do conjunto completo de mundos contra o plano assinado.

A conferência de intenção passa a comparar também todos os IDs/jogos dos
recibos locais com a seleção original. Barreira e recibo locais coerentes com
os CHECKs não ampliam o escopo consentido. A leitura é limitada ao máximo do
contrato mais um item, para detectar excesso sem carregar um conjunto ilimitado.
Publicação, fotos, efeitos, expurgo, conclusão e recuperação usam o mesmo
contrato; um conjunto divergente exige revisão antes de tratar dados.


## Confirmação nativa pela conta — candidata seguinte

A área de direitos recebe confirmação separada da prévia, exclusiva de
`retirar_perfil`, com seleção identificada, aviso de irreversibilidade,
indisponibilidade temporária dos mundos e retenções restritas. A action obtém
identidade/login no servidor e aceita só referência da prévia e confirmação
literal; o serviço revalida contexto nativo recente antes de ler o livro e o
repository reconstrói autoridade/escopo após o I/O. Livro ausente, congelado,
chave incorreta ou leitura inconclusiva não produzem novo consentimento.

`RECREIO_RIGHTS_CONSENT_MODE=native` é uma capacidade servidora separada,
desligada por padrão. Exige configuração integral do executor e fonte de
build válida; não inicializa livro, agenda job nem ativa qualquer recurso em
produção. Encerramento da conta continua somente em prévia. O painel mostra
estado do pedido, preserva o acompanhamento sem jogador e retira o botão de
cancelar prévia quando já há consentimento. Confirmadas não consomem o limite
de três prévias ainda não consentidas. Segredos/bytes de intenção nunca entram
no DTO. Validação remota desta composição e da interface ainda pendente.

A rodada focada 44588168487 (9d297e44) passou 90 de 91 casos. A única
falha foi a expectativa exata do DTO antigo do painel: faltava o novo campo
`operacao: null` quando a prévia não tem consentimento. A correção mantém a
comparação integral, incluindo a negativa de plano/bytes/dados alheios. Os
novos testes de confirmação, livro ausente/congelado e repetição passaram;
nova rodada necessária antes de qualificar esta fonte.


## Captura pessoal consistente — em implementação

O coordenador pessoal passa a reutilizar os leitores existentes na mesma
transação `repeatable read`, em vez de juntar recortes de instantes diferentes.
Cadastro, jogos históricos/versões/conflitos/conquistas e vínculos próprios
entram em NDJSON com projeções explícitas. Metadados paginam de cem em cem;
32 MiB, cem mil registros e 256 jogos são tetos de recusa integral, nunca
truncamento. O arquivo só é montado depois do commit e os buffers intermediários
são apagados inclusive no rollback. SID, aparelho/login, PIN/hashes, nomes de
mundos, dados financeiros e conteúdo compartilhado não são entregues.

Esta captura ainda não equivale à exportação integral da conta: faltam os
domínios pessoais de conta/cobrança e a composição de artefato privado,
expiração/revogação/download. Também não transforma responsabilidade por
perfil em autorização de exportar os bytes completos de um mundo.


## Artefato temporário pessoal — candidata 0233

0233 foi gerada no GitHub em 44589919804, fonte 8f6d2f62, e copiada
intacta após conferir ZIP, proveniência, predecessor, prefixo de 234 recibos
e igualdade integral de todas as tabelas anteriores. Acrescenta somente
`personal_exports`: envelope AES-GCM privado de até 32 MiB no PostgreSQL,
sem chave no banco, uma cópia pronta por conta e validade de dez minutos.
Login/aparelho/perfil/generação da política e responsabilidade original são
revalidados antes de publicar, ler bytes e admitir a resposta após abrir.

Modo `RECREIO_EXPORT_MODE=native`, chave ativa e keyring em pares próprios
(`RECREIO_EXPORT_ACTIVE_KEY`, `RECREIO_EXPORT_KEYRING`) são composição privada;
o padrão é off. Não reutilizar chaves de login, livro de retirada ou backup.
POST de download exige origem do portal e sessão nativa; não publica URL
portadora. Revogar ou substituir retira o corpo atomicamente. A manutenção
existente expira até cem envelopes e remove até cem recibos já sem conteúdo
há 24 h por rodada; o prazo nega download mesmo antes da manutenção. A
remoção da sessão/perfil/aparelho elimina o artefato pela FK. Novos testes
remotos de publicação/repetição/concorrência de revogação/política/auditoria e
expiração ainda precisam passar. Nada aplicado em produção.


A rodada focada 44589568755/db70b8aa passou os 93 casos, incluindo captura
paginada. A primeira rodada do artefato (44591271477/0cdbe71b) passou esses
93 e recusou os cinco testes novos ainda na criação da fixture: o apelido
sintético excedia o limite existente. O nome foi encurtado; nenhum limite de
cadastro ou teste foi relaxado. A validação do artefato precisa ser repetida.

A interface candidata permite preparar, baixar por POST autenticado e revogar
a cópia do perfil, com escopo/validade explícitos, repetição do mesmo pedido e
retorno de login recente. O executor isolado prepara chave própria descartável
para testar essa jornada real no navegador (390 px), incluindo leitura do
arquivo, tentativa de outro adulto e download após revogação. Não usa chaves
ou dados de produção. Confirmação destrutiva continua off nesse executor.


44591852000/7b41f7ac passou 98 casos em oito arquivos. Os cinco cenários do
artefato agora executaram e passaram; nenhuma mudança nos limites do perfil.
Quality 44591277874/0cdbe71b encontrou apenas formatação do recibo derivado da
0233; o JSON derivado foi formatado sem modificar SQL/snapshot/journal ou seus
hashes. A rodada completa/navegador 44591857114 continua em curso, com a mesma
falha de recibo conhecida; precisa de repetição na fonte corrigida.

A candidata seguinte acrescenta auditoria atômica em lote no expurgo de
artefatos e libera o Blob do navegador ao trocar/revogar a cópia. Artefatos
restaurados também terão de ser revogados no coordenador offline antes de
servir tráfego; esta entrega não substitui essa pendência de F8.


A conferência do download foi simplificada para retirar leituras redundantes:
metadados são conferidos sob a trava do recibo antes de carregar o envelope;
a mesma referência é relida na admissão final, após a abertura. Isso conserva
as duas autorizações e a recusa de revogação no intervalo. Nova rodada exigida.
O gate auxiliar `rights-ui` executa somente as três jornadas de direitos no
standalone real com PostgreSQL descartável; não substitui os dezesseis gates.
A captura de 390 px entra na whitelist de artefatos sintéticos para inspeção.


44593297388/ddd4d2e5 passou o gate nativo após simplificar a leitura do
artefato. A primeira tentativa auxiliar de navegador 44593302510 foi cancelada
por faltar a etapa de instalar Chromium nesse novo gate; não é prova verde.
A correção 1601e4f2 passou três jornadas reais em 44593400873: download e
revogação a 390 px, prévia sem jogador e negativa da gestão infantil. Captura
PNG inspecionada: escopo e prazo visíveis, controles legíveis, sem estouro
horizontal. ZIP original guardado fora do Git; SHA e fonte no recibo derivado
`evidencias/direitos-ui-44593400873.json`. Não comprova exportação integral da
conta, encerramento ou ativação em produção.


## Cópia da conta/pagante — em implementação

0234 foi gerada/adotada intacta em 44594508248/d1d05d83: acrescenta `scope`
com default `profile`, torna o vínculo do perfil opcional só para `account` e
confere as duas formas completas no CHECK. Os demais campos/tabelas/constraints
permaneceram iguais; 235 recibos candidatos, nenhum em produção.

O coordenador de conta não cria jogador. Usa a mesma fotografia SQL consistente
para identificação usada no portal, proteção sem hash/geração, declarações,
aparelhos sem credenciais, convites comerciais sem contatos de convidados,
aceites de teste/compra, trocas, assinaturas/períodos próprios e estados de
pedidos de direitos. Joins financeiros exigem cliente `user` do solicitante e
app `recreio`; não inferem autoridade por família ou pagamento de outro adulto.
Metadados livres do provedor, códigos e conteúdo dos perfis/mundos ficam fora
deste escopo. O arquivo de perfil continua com sua autorização própria/parental.

O artefato comum conserva login/aparelho, quota e prazo; ambos os escopos são
revalidados antes da publicação e após a abertura. Repetir um UUID com outro
escopo/alvo é recusado. Novos testes usam conta sem jogador, outro pagante,
outro app da mesma pessoa e contexto infantil. Backend ainda precisa passar
novos gates; interface de escolha conta/perfil segue em implementação.


A fonte 59b75ea4 concluiu os dezesseis gates 44592552895, com o artefato
pessoal, auditoria de expurgo e interface de perfil. A ampliação posterior da
conta/pagante não está incluída nessa prova: dab8a881 passou o gate nativo
44595911500; qualidade segue em curso. A interface seguinte passa a oferecer
conta e perfis sem exigir jogador, com nomes/escopos de arquivo distintos e
nova jornada real de download da conta. Ainda requer sua própria prova de
navegador/rodada completa e conferência de upgrade de artefatos preexistentes.


O ensaio de upgrade recebe o perfil `--copias`: aplica o prefixo histórico
exato até 0233 da fonte 0cdbe71b em outro banco descartável do runner, cria dois
artefatos estruturais com corpos opacos e aplica o DDL atual. Compara todos os
campos/bytes anteriores, exige default `profile`, recusa escopo parcial e repete
as migrations sem efeito. A fixture opaca não afirma validade criptográfica;
cifragem e download reais têm provas separadas. O workflow busca a fonte
histórica fixa antes dos gates rights/integration. Nada roda localmente ou em
banco Railway por esse ensaio; a prova remota deste incremento está pendente.


Quality 44595917025/dab8a881 encontrou leitura direta de `subscriptions` fora
da porta prevista no app. Corrigida a composição: projeções financeiras agora
pertencem a `@informach/billing/recreio-personal-records`, em vez de criar uma
segunda leitura no Recreio. O teste de fronteira permanece intacto; o reader
recebe a transação consistente e limita pagante/app/página, sem decidir acesso.

O primeiro upgrade 44597065604/8e22690c falhou com TypeError e diagnóstico
insuficiente, antes da suíte nativa. A candidata seguinte registra só etapa e
frames de localização sem mensagem SQL/parâmetros/valores. A causa ainda deve
ser confirmada remotamente; não é um upgrade qualificado nem motivo para
relaxar constraints ou reescrever o DDL.


O diagnóstico 44597932940/9ffec971 localizou o TypeError no bind da fixture de
datas: o mesmo cliente postgres.js era entregue ao Drizzle e usado para SQL
nativo. O driver Drizzle 0.45.4 substitui os serializers de timestamp por
identidade; as novas fixtures Date chegavam sem codificação ao protocolo. A
composição de teste passa a usar clientes distintos para migrations Drizzle e
fixtures SQL, encerrando ambos. Não converter dados persistidos, sobrescrever
serializers ou modificar o DDL. A causa foi conferida na documentação primária
da versão em `drizzle-orm/changelogs/0.30.0.md`; nova prova remota obrigatória.

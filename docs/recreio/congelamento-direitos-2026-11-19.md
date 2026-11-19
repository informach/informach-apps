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

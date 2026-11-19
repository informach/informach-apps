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

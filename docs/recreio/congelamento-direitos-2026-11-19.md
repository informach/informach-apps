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
demais domínios; cobrança, auditoria/retencões e identidade global são separados.

Restauração permanece sem tráfego até verificar livro congelado, aplicar todas
as intenções admitidas, comprovar efeitos nativos e renovar autoridades/chaves
atuais. Recibo do consumidor sintético e SHA de uma cerca não autorizam o corte.

# Executor e agenda de backup do Recreio

Continuação de F8/F10, autorizada no fechamento da plataforma. Os componentes
já têm prova nativa, mas ainda falta o processo agendado que os compõe e se
recupera das interrupções. Este plano não declara agenda/custódia habilitadas.

Base qualificada: 0243/244 recibos/80 tabelas; replay técnico a33e94b7 passou
direitos e cluster frio, all/CI ainda em execução. Ensaio real de 20/11, origem
0203/204, restaurou conteúdo/estrutura/globais idênticos e removeu serviço e
temporários. Custo acumulado está medido com pool compartilhado discriminado.

## Ordem de execução

1. Qualificar a fronteira de auditoria dos módulos de publicação, retirada e
   abandono. A imagem operacional não leva Better Auth/login. Não fornecer
   credenciais de SMTP ou cobrança ao serviço de backup.
2. Compor captura consistente, arquivo autossuficiente, cifragem, tentativa
   durável anterior ao PUT, leitura integral, índice assinado, confirmação e
   liberação de reservas. Usar as implementações existentes; sem outra cópia
   das regras ou passagem implícita da prova de homologação para produção.
   Conferir os dois destinos antes da primeira escrita de controle. O portal
   recebe somente a credencial das fotos/exportações; nunca a dos dumps.
3. Reconciliar operações interrompidas antes de criar novas. Captura sem arquivo
   usa abandono nativo sob barreira; publicação que pode ter enviado não pode
   virar ausente por timeout. Resposta perdida exige GET e autenticação integral
   do objeto/índice original, conservando chave/IV/referência. Retomada não
   refaz a cifragem. Rede indisponível mantém pendência com prazo/repetição.
4. Concluir o caminho de recuperação sem credencial da origem, inclusive
   upgrade privado após comparar o inventário original. Verificar a cadeia de
   migrations por timestamps e hashes; schema futuro/inconsistente não é
   autorização para executar arquivos. O PostgreSQL compartilhado de produção
   nunca recebe um restore integral. Publicação é somente do escopo Recreio,
   com identidade, permissões e finanças atuais e credenciais renovadas.
5. Preparar destinos e chaves separados, referências no Railway e recuperação
   fora da perda do serviço original. As seis credenciais no GitHub continuam
   exclusivas da homologação. Material real não vai ao bucket de testes,
   GitHub, logs ou chat. Bucket criado, variável presente ou cópia DPAPI local
   não é prova de recuperação. Recriar um recuperador sem URL da origem e
   comprovar abertura do arquivo efetivamente guardado e do livro de direitos.
6. Configurar o executor com destinos/máximo de bytes/prazo explícitos e limite
   de execução concorrente. Cron/retirada só entram depois da primeira captura
   cifrada real conferida e dos gates. Cadência/retenção serão discriminadas
   junto com custo e atraso observado, sem anunciar RPO/RTO contratual a partir
   do ensaio de 15,4 segundos. Expurgo usa índice de retirada e recibos nativos;
   não apagar o bucket ou recorrer a lifecycle inexistente do provedor.
7. Medir primeira captura, atraso e restauração da agenda. Monitorar ausência
   de captura confirmada e falhas parciais; alertas chegam ao canal existente.
   Homologar falha/repetição/limpeza no GitHub e falha operacional sem conteúdo
   em logs. Testes humanos do portal/Checkout continuam somente no final.

## Gates e limites

Somente inspeção/edição/formatter/sintaxe local. Geração SQL, testes, Docker,
carga e navegador no GitHub; captura/restauração real no executor Railway.
Cada incremento registra fonte e recibos; gates anteriores não certificam
arquivos posteriores. Resumos de estado devem separar implementação,
qualificação, implantação e ativação.

O recibo técnico de replay fecha apenas retiradas. Ele não liquida cobrança,
não verifica idade externa, não aceita responsabilidade em nome de outro
adulto e não libera tráfego ou um jogo ainda em análise. Morada D3–D8 e a
validação em vídeo integrado permanecem fora do fechamento independente.


## Composição nativa em candidata

`capturar-e-publicar.ts` admite todos os handles vazios/privados/distintos e
os destinos antes da primeira escrita. Usa captura/montador nativos, cifra
uma vez, persiste a referência antes do PUT, relê e autentica o arquivo inteiro
e o índice, confirma por auditoria estrita e libera somente um lote de até cem
reservas. Falha conserva o controle durável para reconciliação; não abandona
arquivo incerto ou troca IV/referência após resposta perdida. O proprietário
dos handles/chaves continua responsável por encerramento e limpeza.

A prova preparada no GitHub usa PostgreSQL/HTTP fechado reais do protocolo,
dados opacos sintéticos em PG, código completo do executor e recuperação
a partir do índice/arquivo guardados depois de perder todas as saídas locais.
Compara inventário SQL restaurado e bytes; destinos incompatíveis, bucket
produtivo comum e arquivo preexistente devem falhar sem escrita de controle,
sem pedido S3 e sem destruir o arquivo. A retirada imediata é política da
fixture sintética, não cadência/retenção real. Gates ainda pendentes.

Ainda faltam a composição protegida de ambiente/credenciais, a exclusão de
execuções concorrentes, reconciliação das operações interrompidas, custódia e
prova real antes da agenda. O núcleo sozinho não habilita serviço ou cron.


## Coordenação limitada em candidata

O núcleo passa a exigir uma capacidade emitida por uma transação READ ONLY
própria que mantém uma trava de executor distinta da barreira de captura/GC.
Outra execução retorna ocupada sem esperar ou entrar no callback. O prazo
é limitado a quinze minutos; PID e posse reais são reconferidos entre fases.
Cópia e uso após término são recusados. Encerramento/perda da conexão aborta
o sinal e o proprietário aguarda a tarefa já iniciada antes de devolver.
I/O já emitido continua sujeito aos prazos e recibos nativos; o escopo não
fabrica prova de que uma escrita remota não ocorreu.

As regressões preparadas executam concorrência real, derrubam somente a sessão
coordenadora do banco descartável, exigem aborto sem nova fase, aguardam a
tarefa proprietária, repetem a aquisição e preservam o erro original de callback.
Não há ponte de teste, timeout maior, flag de bypass ou teste pesado local.
O núcleo de publicação também reconfere a capacidade antes/depois do arquivo,
PUT, índice e lote de reservas. Credenciais/ambiente, reconciliação e agenda
produtiva permanecem nas etapas seguintes; gates desta candidata pendentes.


## Publicação interrompida em candidata

A retomada de publicação agora exige o destino completo na mesma transação da
reserva; ID, nome e escopo divergentes não alteram a tentativa ou auditoria.
O reconciliador, sob capacidade real de executor, lê o ciphertext original e
retoma a confirmação/índice, sem novo IV/ciframento. Só NoSuchKey de GET pode
iniciar abandono; ainda exige tombstone permanente assinado e relido, remoção
restrita, confirmação de ausência e lote limitado antes de liberar reservas.
Rede/permissão, NoSuchBucket, corrupção, chave, SQL e auditoria não viram ausência.

A prova fria existente passa a usar essa composição na resposta perdida de
publicação: arquivos locais descartados, índice já guardado e confirmação SQL
pendente. Negativas adicionais usam controle/MAC sintéticos e HTTP fechado:
NoSuchKey com tombstone/ausência e PUT tardio recusado; acesso negado, bucket
ausente e ciphertext corrompido devem preservar reservas e não emitir retirada.
Essas negativas não declaram dump autossuficiente; o caso de objeto presente
continua a restauração SQL/foto real da prova fria. Gates pendentes.


a94129a9 foi recusada no cluster 44819780557: a fixture tardia recolocava
só ciphertext, sem manifesto, e a leitura corretamente parava em manifesto
ausente antes de conferir o tombstone. A correção acrescenta manifesto tardio
assinado de protocolo MAC, sem criar confirmação SQL/verificação de arquivo.
O teste continua exigindo RETIRADO, agora com ambos os objetos tardios; não
aceita uma lista genérica de erros para passar. Não há mudança no leitor nativo.


401a5b0e foi recusada em 44820794166: o manifesto tardio da fixture não
registrava Content-Type application/json no servidor HTTP fechado; o leitor
recusou integridade antes da conferência do tombstone. A fixture agora conserva
esse metadado HTTP e confere o MAC antes de simular a escrita tardia. Decoder
e exigência de RETIRADO permanecem estritos. Nenhum dado/serviço real alterado.

# F8 — arquivo cifrado, captura consistente e retirada

Estado: implementação após a prova nativa `44444276302`. Este plano não declara
backup, coleta ou migração habilitados. Complementa o
[contrato de objetos](objetos-privados-2026-11-18.md) e o fechamento F0–F11.

Objetivo: armazenar e restaurar um arquivo cifrado autossuficiente do banco e
dos objetos referenciados, protegendo a captura contra a coleta normal. Depois,
admitir migração aditiva e retirada verificável sem reativar dados removidos.

Reutilizar Node 24.15.0/PostgreSQL 18.6 e os digests do executor operacional,
SDK S3 3.1172.0 e Drizzle 0.45.4/kit 0.31.11 já fixados. Sem novas dependências
para cifragem. Toda execução pesada, Docker, geração de DDL e restauração roda
no GitHub ou no executor Railway autorizado; localmente só inspeção/edição e
checagens leves. Preparar candidatos sem ativar serviços ou alterar a origem.

## Arquivo antes do armazenamento

1. Criar `apps/recreio/scripts/backup/arquivo-cifrado.ts`, com AES-256-GCM,
   cabeçalho versionado/limitado e contexto de captura autenticado. Entrada e
   saída são capacidades de arquivo já abertas pelo executor, não caminhos de
   navegador. Chaves copiadas na composição, rotação explícita e ausência de
   chave antiga recusada. Hash e quantidade de bytes pertencem à referência
   técnica privada, sem nomes ou credenciais.
2. Usar streams e arquivos privados do executor, sem colocar dump/arquivo inteiro
   em memória. Conferir inventário antes/depois; limitar tamanho e conferir
   comprimento/SHA/tag antes de liberar um resultado. Saída admitida precisa
   estar vazia, ser regular e distinta da origem. Falha de abertura não apaga um
   arquivo preexistente; falha depois da admissão limpa a saída parcial. Manter
   os handles sob responsabilidade do chamador. Testar corrupção, chave/contexto
   divergentes, origem alterada, limites, rotação, truncamento e preservação dos
   originais com arquivos reais no GitHub.
3. Acrescentar transporte S3 de arquivo privado: PUT condicional com tamanho
   conhecido e tentativa durável antes do envio; confirmação por leitura inteira
   com hash/tag, nunca por ETag/HEAD. Recuperação reabre a mesma chave, sem criar
   outro IV/objeto. Prazos cobrem stream e fechamento. Não reutilizar o adapter
   em memória de fotografias para arquivos grandes.

## Captura e proteção dos objetos

O [snapshot exportado do PostgreSQL](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-SNAPSHOT-SYNCHRONIZATION)
só continua disponível enquanto sua transação estiver aberta. O
[`pg_dump --snapshot`](https://www.postgresql.org/docs/18/app-pgdump.html)
permite usar essa mesma visão. A composição abaixo é o protocolo deste projeto,
não uma garantia adicional do provedor.

4. Acrescentar schema próprio de operações de captura e reservas de objetos.
   Identidade/conteúdo da entrega não mudam para satisfazer um backup. As reservas
   ligam captura e entrega por FK restritiva e conservam estado/recibo depois da
   liberação. Estados finais exigem a evidência correspondente; timeout não
   significa que uma escrita externa não aconteceu. Gerar/adotar DDL intacto no
   GitHub, conferir predecessor e upgrade antes dos escritores.
5. Antes de criar o snapshot, o controlador adquire uma barreira exclusiva de
   captura/coleta em conexão própria. A origem continua READ ONLY. Na visão
   exportada, inventariar banco e todas as fotografias em bucket; fixar o
   manifesto por captura. Em transações de controle, travar mundos em ordem e
   reservar suas entregas, inclusive uma que tenha sido destacada pela retenção
   depois do snapshot. Não liberar a barreira antes de todas as reservas duráveis.
6. O coletor adquire a versão compartilhada dessa barreira antes da admissão,
   depois mundo → entrega → reservas. Só admite objeto já destacado/retirando,
   sem reserva ativa, após carência e tentativa em voo. Assim, uma coleta já
   admitida antes da barreira só alcança fotografias retiradas antes do novo
   snapshot. Uma captura iniciada antes de adquirir a barreira é inválida.
   [Travas de sessão e transação](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS)
   têm vidas distintas; usar conexão dedicada, prazo e liberação explícita,
   encerrando-a também na falha. Não deixar trava de sessão num pool genérico.
7. Com reservas confirmadas, liberar a barreira e executar dump/inventário sob
   o snapshot original ainda aberto. Ler e verificar cada objeto referenciado.
   O arquivo contém dump, manifesto e todos os objetos necessários, com versões
   de formato/chaves recuperáveis. Nenhum ponteiro pode depender exclusivamente
   do objeto vivo depois de liberar sua reserva. Só liberar reservas após prova
   do arquivo completo guardado, ou abandono conciliado da captura.

## Retirada e falhas recuperáveis

8. Implementar o coletor com tentativa/token antes do DELETE e I/O fora das
   travas. Após a chamada, confirmar ausência por leitura/inventário restritos à
   chave do recibo, reler token/estado/reservas e registrar retirada/auditoria
   atomicamente. Resposta perdida é conciliada, sem declarar ausência por erro
   de rede. Nunca apagar um objeto ainda ligado a uma fotografia ou captura.
9. Um worker antigo pode retomar depois da expiração do seu token. A expiração
   impede publicar ponteiro, mas não comprova que um PUT externo parou. Conservar
   tombstones e revisitar recibos retirados para limpar PUT tardio; não apagar o
   recibo para esconder um órfão. Fonte alterada, chave ausente, destino divergente
   e falha de DELETE têm estados operacionais distintos e alertas sem conteúdo.
10. Limitar scanners por destino/escopo, prazo e quantidade, com índices devidos.
    Uma falha precisa aparecer no HTTP/monitoramento e permitir atender outros
    objetos. Não introduzir rota de migração ou cron habilitado antes dos gates
    de leitor, coleta, captura, restauração e rollback.

## Restauração, custódia e corte

11. Estender o executor em `apps/recreio/scripts/backup/` e o Docker/workflow
    existentes para recuperar o arquivo efetivamente guardado, conferir
    tamanho/hash/tag/manifesto e restaurar em banco e bucket isolados. Extração
    aceita apenas entradas técnicas permitidas, sem caminhos livres/symlinks.
    Reescrever explicitamente destinos de objeto para o bucket isolado e
    comprovar que nenhuma leitura vai à origem. Comparar estrutura, conteúdo,
    permissões e leitura nativa. Apagar todos os recursos sintéticos ao final.
12. Integrar o registro de direitos F7: uma restauração antiga precisa reaplicar
    retiradas concluídas antes de servir dados. Checksum correto não autoriza
    reintroduzir perfil/identificador removido. Não declarar F7 por restaurar um
    snapshot de banco ou por retirar apenas UUIDs de um mundo.
13. Preparar custódia e recuperação das versões de chave fora da perda do serviço
    original. Não colocar chave em repositório, artefato público, log ou chat.
    As credenciais de produção ficam no Railway; os seis segredos do GitHub
    continuam exclusivos da homologação. A prova de uma chave descartável não
    certifica recuperação de chaves reais.
14. Somente depois, publicar leitor/recuperação/coleta compatíveis, preparar o
    primeiro arquivo real cifrado e medir custo, cadência, RPO e RTO. Fazer a
    migração em lotes limitados, fonte PG conservada até confirmação integral.
    Rollback depois de mover bytes exige devolver bytes verificados a PG ou
    manter o leitor compatível; desligar uma flag ou fixar fonte antiga não basta.

Os gates finais precisam de falhas reais de auditoria, resposta perdida,
concorrência captura/retenção/coleta, reinício após cada etapa, objeto ausente,
PUT tardio, arquivo truncado/corrompido, chave indisponível e restauração do
objeto guardado. O ensaio lógico manual já concluído continua como evidência
própria; não substitui essas entregas.


## Primeiro incremento em qualificação

`arquivo-cifrado.ts` introduz um formato próprio de arquivo (distinto do
envelope em memória das fotografias): AES-256-GCM, IV de 96 bits, tag de 128,
cabeçalho de até 768 bytes com contexto da captura e referência estrita de
integridade. A capacidade técnica aceita até 64 GiB, com teto menor por
composição e prazo por operação. Esse teto não demonstra capacidade ou RTO
medidos no executor.

Cifragem faz inventário prévio e uma segunda leitura por blocos de 64 KiB,
verificando que a origem permaneceu igual. Abertura confere ciphertext antes e
durante a decifragem, tag, SHA/tamanho abertos e identidade do arquivo. Os
handles não são fechados pelo codec. Destino preexistente/alias/hardlink é
recusado; saída parcial admitida é truncada e sincronizada na falha. Cancelamento
não publica arquivo, e erros não incluem caminhos/chaves/conteúdo.

Os testes com arquivos reais incluem vazios/binários, rotação, adulteração com
hash externo recalculado, chave/contexto divergentes, truncamento, preservação
dos originais e alteração/cancelamento durante a escrita. Só o GitHub executa
esses testes, inclusive o caso sintético de 32 MiB. Faltam seus gates, perfil de
memória/desempenho, transporte de arquivo, reservas de captura e o restante do
fluxo. Nenhum backup ou objeto de produção usa esse formato nesta etapa.


A primeira rodada `44447113693`/`7cfd9169` encontrou fechamento indevido dos
handles emprestados ao descartar um ReadStream. A correção `dca0714f` usa leitura
posicional por blocos, sem transferir o descritor. Os 25 testes de arquivos
passaram em `44447636058` (52 testes de objetos no total), inclusive cancelamento
e alteração real da origem; gate quality da candidata `44447983566`
aprovado. Nenhuma asserção foi removida para passar.

O perfil separado prepara arquivo sintético de 384 MiB em contêiner com limite
de 256 MiB e sem rede/banco. Exige RSS do processo até 192 MiB, integridade de
origem/abertura e limpeza, com tempos e recibo técnico. Usa os digests do executor
Node 24.15.0/PostgreSQL 18.6, sem instalar versão nova. A construção e o teste
só rodam no GitHub; não constituem restauração de um backup guardado ou medição
do RTO completo. Este perfil ainda precisa executar.


O perfil `44448553986`/`52e45d8f` passou. Arquivo de 402.653.184 bytes (384 MiB),
pico RSS de 74.784.768 bytes (71,32 MiB), cifragem em 2.945 ms e abertura em
4.607 ms, com origem, conteúdo aberto e limpeza conferidos. O contêiner ficou
sem rede, limitado a 256 MiB/duas CPUs, e o processo ficou abaixo do teto de
192 MiB. Artefato baixado/conferido por SHA e campos estritos.
[Recibo e limite de escopo](evidencias/arquivo-memoria-44448553986.json).
Não é RTO do backup completo, transferência S3 ou carga de gameplay.

A candidata seguinte acrescenta conferência integral de ciphertext/tag/conteúdo
sem persistir uma segunda cópia aberta. Isso permite validar o arquivo após
readback do bucket sem gravar novo dump em claro. Referência, tamanho e presença
da chave são admitidos antes de um download grande. Mantém a mesma decifragem
verificada, os handles emprestados e os limites; ainda precisa de gates próprios.


A conferência sem saída aberta `87d74f37` passou em `44449528585`, incluindo
os tipos do app e os testes de objetos. O transporte de arquivos seguinte
(`arquivo-s3.ts`) usa SDK S3 real e FileHandles privados. Deriva a chave somente
da referência da captura, valida chave/limites antes da rede, recusa clientes
com repetição automática e só confirma PUT/412 depois de GET integral e
conferência de hash/tag/conteúdo. A recuperação não exige a cópia cifrada local.

O upload produz blocos cifrados com armazenamento independente e backpressure;
o HTTP pode reter um chunk depois de pedir o próximo. Não reutilizar/zerar esse
buffer como se o socket já tivesse terminado. Encerrar o iterador não fecha o
FileHandle emprestado. O readback guarda somente ciphertext, limpa estágio
parcial na falha e não sobrescreve arquivo preexistente. Cabeçalhos/parciais,
comprimento/corpo reais e prazo do stream são conferidos. O adapter limita PUT
único a 4 GiB cifrados por operação, com teto menor por composição; é limite
operacional do adapter, não capacidade/RTO certificados do Railway.

Os cenários de FileHandle + SDK + HTTP fechado verificam blocos, replay 412,
resposta perdida sem nova escrita, corpo adulterado/parcial/sem comprimento,
objeto ausente, limite/chave antes da rede, preservação dos originais e timeout
durante o corpo. A fonte `f36c944e` passou em `44450866756`: tipos e 66 testes
de objetos, incluindo 26 de arquivos e 13 de transporte; quality completo do
Recreio `44450870353` também aprovado. Não executam
captura de banco nem implementam a barreira/reservas/GC ou backup agendado.

A prova externa seguinte usa somente 64 MiB sintéticos, as seis credenciais já
restritas ao bucket de homologação e nenhuma conexão de banco. Exige PUT e
readback completos, recusa de sobrescrita, replay, recuperação depois de apagar
a cópia cifrada local, abertura idêntica, acesso anônimo negado e limpeza remota
e local comprovadas. O prefixo próprio deve estar vazio antes; apenas a chave
própria é removida. Recibo técnico registra tempos e pico de memória. A chave
descartável vive só no executor: não demonstra custódia de chaves nem reinício
do backup em produção.

A execução `44453304274`/`07b5ff8a` passou: 67.108.864 bytes sintéticos,
cifragem em 396 ms, PUT/readback em 4.237 ms, replay em 3.866 ms e recuperação
em 1.202 ms. Pico RSS de 183.816.192 bytes; esse job de rede não recebeu o
limite Docker do perfil offline. Todos os critérios e ambas as limpezas foram
confirmados. [Recibo técnico conferido](evidencias/arquivo-provider-44453304274.json).
O perfil offline da mesma fonte também passou em `44453287884`: 384 MiB,
RSS de 75.239.424 bytes, cifragem em 4.161 ms e abertura em 4.369 ms,
[recibo](evidencias/arquivo-memoria-44453287884.json). Nenhum dado real foi usado.

## Reservas de captura em preparação

`packages/db/src/schema/recreio-backup.ts` acrescenta apenas duas tabelas novas:
`backup_captures` conserva destino e estados de preparação, inventário,
arquivo preparado, verificação, abandono ou revisão; `backup_object_holds`
liga cada captura às entregas por FKs restritivas e conserva o recibo depois
da liberação. Hash/quantidades, referências do arquivo e datas têm CHECKs;
não há dump, credenciais ou material de chave nessas tabelas. Campos de arquivo
precisam estar completos antes de admitir a escrita externa. Um abandono após
preparar arquivo exige prova de ausência, não apenas expiração.

Este é schema candidato aditivo, ainda sem migração gerada ou escritor
operacional. A consistência entre liberação e estado da captura exige o writer
transacional e seus testes; FK/CHECK isolados não demonstram captura segura.
Geração deve ocorrer em `db-generate.yml`, sem banco/segredos/seeds, e os três
arquivos gerados devem ser adotados intactos, com predecessor e hashes conferidos.
Qualificar upgrade e concorrência em PostgreSQL descartável antes de qualquer
implantação. Não alterar as 0216/0217 para incluir essas tabelas.

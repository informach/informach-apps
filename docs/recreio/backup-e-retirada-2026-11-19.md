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

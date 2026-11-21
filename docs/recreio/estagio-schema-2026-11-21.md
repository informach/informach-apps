# Importação nativa de schema no ambiente privado

Fonte 01799386696adb727353dd45a317697a2dae3a2c. Captura fria 44891895090 e
qualidade 44891897411 passaram. [Recibo derivado](evidencias/estagio-schema-44891895090.json).
A prova usa somente dados sintéticos, clusters Unix privados e o bucket exclusivo
de homologação; não tem credencial do PostgreSQL de produção.

A serialização renomeia temporariamente o schema privado e usa pg_dump, sem
reescrever texto SQL. O nome/OID de origem é restabelecido mesmo se a ferramenta
falhar. O arquivo nativo é privado, limitado e ligado por capacidade opaca à
origem, descritor, inode, SHA, tamanho e timestamps. Cópia de objeto JavaScript,
origem encerrada, arquivo alterado e destino ocupado não autorizam importação.

pg_restore importa somente o arquivo nativo assim admitido, em transação única,
sem clean ou criação de banco. O filtro --schema não é repetido: ele excluiria
entradas sem namespace, inclusive CREATE SCHEMA, de um arquivo já restrito.
Não se desabilitam FKs, constraints ou autoridade atual para fazer o ensaio passar.

A prova comparou as 81 tabelas e seus dados, conservou os globais atuais e o nome
da origem, cancelou uma importação bloqueada e conferiu rollback integral.
O estágio foi removido com nome/OID e dependências conferidos; a capacidade foi
expirada. Corrupção é teste destrutivo ao final: não se tenta reparar e
reutilizar um arquivo já admitido e alterado. O contrato de imutabilidade também
fixa mtime/ctime, além do conteúdo.

O disparo 44890994323 atingiu o limite de 150 segundos. O limite não foi elevado;
foram acrescentados quadros fixos de fase/tempo, sem SQL, dados ou respostas de
provedor. A rodada 44891895090 passou; uma repetição no mesmo commit verifica
estabilidade. Um único resultado verde não demonstra ausência de instabilidade.

Ainda faltam publicação seletiva no destino compartilhado corrente, delta de
auditoria, reconciliação dos fatos atuais, encerramento pago posterior à captura,
rotação de autoridades e admissão de tráfego. Dois ensaios deste componente não
seriam duas recuperações completas. Nenhuma migração ou alteração produtiva foi
executada por esta candidata.

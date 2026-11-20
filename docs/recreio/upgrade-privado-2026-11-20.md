# Atualização privada da cópia restaurada

A primeira prova real de 20/11 recusou a cópia antes do upgrade, com limpeza
confirmada. Origem somente leitura, 204 recibos, nenhum DDL no PostgreSQL
original. Serviço temporário removido; inventário voltou a 38 serviços, quatro
volumes e um bucket, sem alterações pendentes.
[Recibo da recusa](evidencias/upgrade-privado-producao-2026-11-20-recusa.json).

## Causa e proveniência

Dois SQLs antigos foram reescritos antes desta frente. A 0010 teve somente
comentários alterados em 107babba; o DDL CREATE SCHEMA IF NOT EXISTS ai_mastra
permaneceu igual. A 0052 original removia duas tabelas da Agenda; c3616caa
a tornou SELECT 1 e moveu a remoção para depois da cópia verificada. Esse
conserto histórico preveniu exclusão prematura em atualizações posteriores.
O hash antigo, isoladamente, não permite concluir se houve perda de conteúdo.

Os dois recibos atuais de produção correspondem exatamente aos blobs originais
de 8945f70faa35280e479bff361a135fe83458abc7 e
3b53c2733f7878c30377bec038c5dcb18042ae8d. Todos os timestamps e outros 202
hashes correspondem à release pública d014bd90. Não é diferença de CRLF.
Não alterar esses recibos para aparentar execução dos arquivos mais novos,
nem restaurar o DROP antigo no diretório de migrações executáveis.

O catálogo migration-provenance.ts conserva índice, timestamp, hash do arquivo
publicado, hash original e commit original. O verificador padrão permanece
published-only. Somente o caminho privado opta explicitamente pelo perfil
informach-historical-sql-2026-11-20; não existe flag para ignorar checksum.
Qualquer mudança de índice, timestamp, arquivo publicado ou hash histórico
fora dessas identidades exatas continua sendo recusada.

O upgrade oficial aplica somente o sufixo posterior ao último recibo. Não
reexecuta SQL histórico nem reescreve recibos; a conferência final compara
os IDs, hashes e timestamps de todas as linhas originais. Comparações dos
valores antigos do Recreio, dados alheios e globais continuam obrigatórias.

## Qualificação exigida

O GitHub deve conferir os blobs completos no histórico público e exercitar
duas origens sintéticas: os SQLs da release atual e os dois SQLs históricos.
Estes últimos só são executados no banco sintético vazio, antes de inserir
qualquer conta/conteúdo. Ambas as origens devem restaurar e atualizar somente
a cópia de 204 para 244, conservar os recibos originais e recusar checksum
adulterado com limpeza. A política explícita também tem negativas de arquivo
publicado, timestamp e hash desconhecido.

Depois dos gates, repetir a captura real somente leitura e o upgrade privado
no Railway. Essa prova não autoriza publicação seletiva, reabertura de tráfego,
liquidação financeira, migração original ou encerramento real de contas.
F7/F8 operacionais completos continuam nos critérios de fechamento.


## Prova concluída na cópia real

O perfil a2e96c98 passou os contratos e as duas origens no GitHub
44827389570, com qualidade 44827394219. [Recibo sintético](evidencias/upgrade-historico-github-44827389570.json).
A repetição Railway 32a42085-b088-4f99-bb93-9a955b07c221 concluiu às
22:23:10 UTC: captura de 20.057.030 bytes, 265 tabelas/297.431 linhas;
cópia de 204 para 244 recibos, 40 migrações e 294 tabelas finais.
Os dois recibos históricos e todas as demais linhas originais da cadeia
foram preservados. Valores antigos do Recreio, tabelas alheias e globais
continuaram idênticos nas verificações aplicáveis.

Total de 18.804 ms; backup 2.501 ms e ciclo privado com restauração/upgrade/
conferências 10.540 ms. Não inclui provisionamento/build nem define RPO/RTO.
Temporários e serviço removidos; ausência verificada, 38 serviços/quatro
volumes/um bucket, nenhum staged. Depois, consulta somente leitura confirmou
204 recibos/dois mundos/dez fotos na origem e ausência da tabela nova.
Deployments de portal/Morada/PostgreSQL permaneceram iguais.
[Recibo real sanitizado](evidencias/upgrade-privado-producao-2026-11-20.json).
Não houve dump real no GitHub ou bucket de homologação, migração da origem
ou publicação de dados recuperados. As etapas operacionais F7/F8 restantes
não são substituídas por esta prova de atualização privada.

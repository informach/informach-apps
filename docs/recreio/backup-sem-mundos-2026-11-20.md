# Backup do Recreio antes do primeiro mundo

O Recreio precisa operar independentemente da evolução do Morada. O ensaio
antigo exigia ao menos um mundo e uma fotografia e, por isso, recusou o banco
isolado de homologação, que ainda não recebeu jogadores ou compras. A recusa
`MUNDO_PERSISTIDO_AUSENTE` removeu seus temporários e não atualizou o schema.
Nenhum mundo, usuário ou consentimento foi criado para contornar a condição.

## Correção e qualificação

O ensaio lógico e o upgrade privado deixam de depender de conteúdo de jogo.
Conferem o snapshot exportado e as estatísticas inteiras/não negativas, e
registram as quantidades de mundos/fotografias no recibo. Zero é um estado
válido da plataforma. Conteúdo, estrutura, ACL, globais, cadeia de migrations,
preservação das colunas antigas e limpeza continuam obrigatórios. Não há
flag para dispensar integridade ou autorizar a origem. Um recibo com zero
mundos não prova restauração de gameplay.

No GitHub, a prova anterior com mundo/foto conserva a conferência dos bytes,
papéis e ACL. Uma segunda prova restaura a plataforma sem mundos e preserva
uma sentinela de outro schema. A imagem de upgrade conserva os dois perfis
de histórico e acrescenta uma origem com dados de perfil, sentinela externa
e zero mundos: 204 para 244 apenas na cópia privada. Todos os perfis repetem
a recusa de checksum desconhecido e conservam os recibos originais. Fixtures
e testes pesados são exclusivos do GitHub; os gates desta correção pendem.

## Estado real da homologação

O backup de volume `7c0c13a8-7cf9-428d-8c45-57be09e57abb`, criado em 21/11
às 00h19 UTC (20/11 no Brasil), antecede a atualização. O banco tinha 224
recibos, zero perfis/clientes Recreio e zero pedidos/aberturas do portal.
Esses números locais não afirmam ausência de objetos no provedor financeiro.

TLS estava desligado e foi habilitado com certificado próprio persistido no
volume, chave 0600 e recarga nativa. Às 00h23 UTC uma nova conexão require
comprovou TLS 1.3 e schema ainda em 224. Fingerprint SHA-256 do certificado:
`2860AA8538097DADD54005AAC5AB61D4E98420C16656F1D267F97D78904E87C8`.
Vence em 21/11/2027 às 00h22m54 UTC; renovar antes dessa data. Os consumidores
ainda precisam da URL com sslmode=require. Habilitar TLS não proíbe por si só
conexões sem TLS. [Contrato PostgreSQL 18](https://www.postgresql.org/docs/18/ssl-tcp.html).

O serviço temporário `7ca00120-586f-46fa-a143-3df187b55b36` foi removido após
a recusa; sua ausência foi confirmada. Repetir o ensaio com fonte qualificada antes
de migrar a homologação. A produção compartilhada permanece em 204 e seu
backup manual continua dependente da decisão sobre duas cópias antigas.

# F8 — conteúdo autossuficiente do arquivo de captura

Estado: primeiro incremento em preparação após captura/reservas e prova de queda do driver.
Não há arquivo de banco guardado ou rotina de restauração implementados por
este desenho. Complementa [captura e retirada](backup-e-retirada-2026-11-19.md).

O arquivo externo já tem cifragem/limites/transporte próprios. Seu conteúdo
precisa conservar dump, inventário e todas as fotografias em bucket da mesma
visão, incluindo as versões de chave necessárias. Guardar só o dump deixaria
ponteiros dependentes dos objetos vivos.

## Formato e responsabilidades

Implementar `apps/recreio/scripts/backup/arquivo-composto.ts`, sem rede/banco.
Formato `RCROBK01`, com quadros sequenciais de cabeçalho JSON canônico estrito limitado
e quantidade exata de bytes. Tipos permitidos, nesta ordem: inventário geral
da captura, chaves das fotografias, dump PostgreSQL custom, inventário lógico
do banco, fotografias cifradas, fechamento. Não há caminhos, nomes de arquivo,
symlinks, código, comandos ou URLs no protocolo. IDs técnicos e referências
completas pertencem ao manifesto privado, não à auditoria pública.

As chaves de fotografia entram em bloco binário de até dezesseis pares
identificador/32 bytes, apenas as versões usadas. Nenhuma chave de cifragem do
arquivo externo entra nele. O arquivo composto fica temporariamente em disco
privado (diretório 0700/arquivos 0600) e só sai do executor cifrado com chave
independente. Não registrar material de chave, dump, hashes de credenciais ou
conteúdo em logs/artefatos públicos. A custódia da chave externa continua sendo
uma entrega separada; prova com chave descartável não a conclui.

O montador recebe FileHandles abertos e vazios, teto/prazo e capacidades de
origem. Faz leitura posicional em blocos; valida tamanho/hash/identidade antes
e depois e não fecha handles emprestados. Fonte e destino não podem ser o
mesmo inode ou hardlinks. Falha limpa somente uma saída vazia previamente
admitida; nunca trunca arquivo preexistente. Fotografias entram uma por vez,
com referências na ordem canônica do inventário e conferência de tag/conteúdo;
não colocar dump ou lista inteira de objetos em memória.

O leitor primeiro confere o arquivo inteiro e o fechamento, incluindo o SHA
externo do conteúdo, contexto, ordens/contagens, limites e cada objeto. Somente
depois fornece capacidades de copiar trechos verificados para destinos privados.
Recusa cabeçalhos extras, duplicidade/ordem divergente, truncamento, excesso,
chave ausente e alteração da origem. Não existe extração genérica de caminhos.

## Composição e prova

1. Na visão exportada ainda aberta de `comCapturaConsistente`, executar
   `pg_dump --snapshot` e `inventariarBackup`. Conservar reservas duráveis.
2. Copiar cada envelope por `recuperarEnvelope`, com destino exato conferido;
   montar o arquivo e fechar seu manifesto contra o inventário fixado.
3. Cifrar o composto com `arquivo-cifrado`, persistir referência antes do PUT,
   enviar e recuperar de fato por `arquivo-s3`. Conferir novamente o composto
   completo guardado antes de liberar qualquer reserva.
4. Restaurar dump em PostgreSQL descartável e copiar fotografias para bucket
   isolado. Comparar inventários, hashes, permissões e leitura nativa antes de
   qualquer normalização. Depois aplicar diferenças operacionais explícitas:
   destinos exclusivamente isolados, workers desabilitados, tokens antigos
   inválidos e replay de direitos F7. Não ler/escrever o bucket original.
5. Operações antigas de captura no dump não conservam sua visão exportada.
   Reconciliá-las sem executar tentativas antigas, conservar recibos e impedir
   que controles restaurados acessem destinos de produção. Arquivos anteriores
   não precisam ser incluídos recursivamente no novo backup.

Testes de formato usam arquivos reais com dump/objetos sintéticos, vazio com
zero fotografias/zero chaves, múltiplas versões, corrupção/truncamento em cada
quadro, limites/cancelamento, origem alterada e originais preservados. A prova
seguinte usa pg_dump/pg_restore reais, banco e bucket descartáveis no GitHub,
perda da cópia local, conteúdo guardado e limpeza conferida. Só depois ampliar
o executor Railway e medir recursos/custo/RPO/RTO com dados reais protegidos.
Todos os testes, builds e cargas rodam remotamente.

## Primeiro incremento em candidata

O montador e conferidor estão implementados como primitivas privadas, sem
rede, banco ou rotina operacional. O inventário lógico é JSON canônico; SHA de
cada parte, cabeçalhos e fechamento precisam ser coerentes. Cabeçalhos e
inventários com campos duplicados não são normalizados silenciosamente. Chaves
extras não usadas e objetos fora da ordem/lista esperada recusam o arquivo.
Dump usa blocos de 64 KiB; apenas uma fotografia limitada e o inventário de até
512 KiB entram em memória. Entrada e saída continuam abertas ao chamador.

Os testes reais de arquivos cobrem duas versões/zero chaves, composição com o
envelope externo, adulteração mesmo recalculando SHA externo, duplicidade de
campos/objetos, truncamento/excesso, chaves ausentes/erradas/extras, cancelamento,
limite total, alteração do dump e preservação de destino preexistente. Ainda
precisam passar no GitHub. Não há extração, pg_dump composto, transporte dessa
captura, liberação de reservas ou restauração implementados por esta etapa.

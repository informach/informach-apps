# F8 — índice de recuperação independente do banco original

Estado: próximo incremento; não implantado. Complementa
[arquivo composto](arquivo-autossuficiente-2026-11-19.md) e
[captura/retirada](backup-e-retirada-2026-11-19.md).

Guardar a referência do arquivo apenas no banco original não permite localizar
e autenticar o backup depois de perder esse banco. A recuperação precisa de
referências autenticadas fora dele, além da custódia das versões de chave.

## Publicação e retirada

Criar `scripts/backup/indice-recuperacao.ts` como primitiva sem I/O. Documento
JSON canônico, limitado a 32 KiB, sem nomes, conteúdo familiar, credenciais,
material de chave ou URL. Publicação vincula captura, destino/escopo exatos,
fonte Git, datas nativas, referência do arquivo cifrado, referência do composto
e resumo conferido. Hash/tamanho/contexto dos dois arquivos precisam coincidir.

Autenticar o documento inteiro com HMAC-SHA256 e chave derivada por HKDF-SHA256,
com domínio/versão próprios e identificador da chave. Não reutilizar diretamente
a chave AES como chave HMAC. Manter rotação explícita e comparação de MAC em
tempo constante. [APIs Node 24](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptohkdfsyncdigest-ikm-salt-info-keylen).
Uma assinatura válida não demonstra posse das chaves antigas de decifragem;
esse caso deve aparecer separadamente e nunca usar a chave atual como fallback.

O publisher deverá persistir os mesmos bytes do índice antes da primeira
tentativa externa, somente após conferir o arquivo completo guardado. PUT
condicional e leitura integral autenticada confirmam sua publicação; resposta
perdida é conciliada sem gerar outro índice. Caminho fixo por UUID de captura,
sem ponteiro/URL recebido do navegador. Datas/recibos de publicação e de retenção
não podem mudar em replay para forçar outra assinatura.

Retirada tem documento próprio, também assinado, vinculando captura, destino e
SHA do objeto com motivo fechado. Ele prevalece sobre publicação antiga, mesmo
que um worker retome um PUT depois da retirada. Não sobrescrever a publicação
para esconder o histórico. Ausência de retirada precisa de prova do provedor;
erro de rede/permissão não é ausência. Documento contraditório falha fechado.
Coleta conserva tombstone e revisita PUTs tardios. O adapter S3 e o controle
durável dessas etapas ainda precisam ser implementados e qualificados.

## Recuperação e limites

Sem banco original, o operador deverá listar somente o prefixo permitido,
validar índices/retiradas com o chaveiro recuperado e escolher um arquivo
autenticado, informando lacunas. Não confiar em ETag, LastModified ou ausência
inferida de erro. Recuperar, abrir, conferir composto e restaurar em destinos
isolados antes de qualquer tráfego. SQL/arquivos antigos não revalidam acessos.

Este índice não substitui o ledger externo de direitos F7, replay de retirada
de dados, políticas de retenção aprovadas, custódia recuperável das chaves,
backup agendado, provas de restauração ou RPO/RTO medidos. Não anunciar essas
entregas por existir um documento assinado.

# Recreio — objetos privados e recuperação, F8

Em implementação. A leitura do ambiente Railway nesta execução confirmou 34
serviços, três volumes e zero buckets. Não foi criado bucket, configurada chave,
movido byte, habilitada agenda ou alterada produção nesta etapa.

## Contrato do provedor e composição necessária

A [documentação oficial Railway](https://docs.railway.com/storage-buckets#s3-compatibility)
admite objetos privados por S3, mas ainda não oferece versionamento, object lock,
lifecycle ou cifragem configurável do lado do servidor. O cliente deve usar a
região e o estilo de URL reais da credencial. O conector retornou busca válida,
mas falhou ao ler a página; a página oficial foi lida diretamente.

Fotos/exportações e backups precisam de buckets e credenciais separados. O
portal não deve receber a credencial dos dumps do banco compartilhado. Política
de expurgo e detecção de órfãos pertencem ao serviço; existência de bucket não
comprova backup, imutabilidade ou recuperação. Chaves de cifragem permanecem
fora dos objetos, com recuperação própria e retenção das versões necessárias.

## Primeiro componente em candidata

`features/objetos/criptografia.ts` contém um envelope limitado em memória com
AES-256-GCM do Node: IV aleatório de 96 bits por gravação e tag de 128 bits.
Cabeçalho, tipo e contexto técnico são autenticados como AAD; checksum e tamanho
da referência autoritativa são conferidos antes de devolver conteúdo. O objeto
não contém a chave ou o checksum do texto aberto. Não há plaintext devolvido
antes da validação da tag; buffers intermediários abertos são zerados.

O chamador fixa um limite positivo de até 256 MiB; o limite do manifesto e a
cota do produto continuam sendo obrigações adicionais do adapter. O componente
recusa excesso em vez de truncar. Backups maiores exigem executor de arquivo ou
stream autenticado, sem liberar partes não autenticadas ao restaurador.

O formato carrega versão/chave e contexto técnico UUID para foto, exportação,
backup ou recibo de retirada. A referência deve vir do banco/recibo confiável,
nunca dos metadados que chegaram do bucket. Rotação lê objetos antigos somente
enquanto a chave correspondente existe; não há fallback para chave ativa ou
bytes legados. A configuração é copiada para impedir alteração por referência.

Não usa SDK S3 nem novas dependências; não realiza rede, persistência,
autorização ou migração. Precisa passar no GitHub antes de ser considerado
validado. A API de criptografia foi conferida na
[documentação Node 24](https://nodejs.org/docs/latest-v24.x/api/crypto.html).
As versões Node/dependências do repositório permanecem fixas.

## Integração e provas restantes

1. Adapter S3 com credenciais apenas no servidor, timeout/corpo limitados,
   escrita e recuperação pelo mesmo recibo e leitura íntegra antes de confirmar.
   Homologar no bucket real isolado; tratar resposta perdida e exclusão própria.
2. Foto nova: preparar operação sob autoridade/cerca, I/O fora das travas,
   reler cerca/revisão na confirmação. Objeto órfão não vira fotografia válida.
3. Migração aditiva: ler bytes existentes, conferir SHA, cifrar/enviar/reabrir,
   confirmar ponteiro sem retirar o original antes da homologação. Não alternar
   silenciosamente para a cópia antiga quando um objeto estiver corrompido.
4. Recortes F7: captura consistente, artefato privado, download autenticado
   revogável e expurgo. O envelope não concede direito de baixar um objeto.
5. Backup: dump consistente da origem somente de leitura, cifragem e recibo,
   agenda e retenção delimitadas; restaurar o objeto realmente armazenado em
   destino novo, conferir conteúdo/estrutura/limpeza e medir RPO/RTO.
6. Retirada de identificadores: recibos concluídos devem sobreviver à recuperação
   e ser reaplicados antes de servir conteúdo restaurado. O backup antigo não
   autoriza reintroduzir dados de uma exclusão posterior.

Todos os testes, builds, ensaios de bucket e restauração rodam no GitHub ou no
executor operacional remoto. O ensaio lógico já realizado não fecha F8.

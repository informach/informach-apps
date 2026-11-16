# Recuperação dos pacotes privados de arte

Conferido em 16/11/2026. Isso recupera os arquivos de arte; restauração do banco,
mundos, diário e configurações continua seguindo o runbook próprio. Nenhuma
restauração ou troca de pacote em produção foi executada nesta prova.

## D2 utilizado pelo alfa

Repositório `informach/artes-3d`, relido como PRIVATE. Pré-release interna
`morada-arte-d2-4198478735b6`, release 446270559, asset 751930796. ZIP:
37.879.766 bytes, SHA-256
`d9775ceeba79c3ca460e816be4bbdb4d5a2dbb4eead93a69bf6d03793ae908ed`.
O manifesto V3 tem SHA-256
`4198478735b643e07d4ce0821db82654c42847bbf996d1d07a99a5890b21672f`,
igual ao pacote usado em `/data/arte/d2-4198478735b6`.

O job privado `recuperar-d2`, execução `43875526133`, fonte `e4fb56da5`,
baixou o ZIP com `GITHUB_TOKEN` Contents read, conferiu seu hash e o manifesto,
os hashes contidos nos nomes dos recursos e os tamanhos declarados. Também
descomprimiu cada cópia Brotli e comparou seus bytes com o original. Resultado:
240 arquivos, 24.723.634 bytes originais e 37.810.510 bytes com Brotli.

O pacote já havia sido verificado manualmente quando ainda era rascunho. A
nova prova permite recuperação automatizada sem depender de token de escrita
ou do prazo dos artefatos do Actions. O arquivo permaneceu privado e não foi
marcado como Latest; origem, manifesto e bytes não mudaram.

## Candidata D3

Pré-release privada `morada-arte-d3-v4-59f2614a-0c118aaf`, release 446608123,
asset 753448365. O job `recuperar` da mesma execução recuperou o ZIP original
e conferiu seu SHA e as 240 somas anexas. Não ativar essa arte em um servidor
Mundo V2/protocolo 1: D3 e seu contrato continuam somente em candidata.

## Como repetir a conferência

No repositório privado, usar `.github/workflows/morada-arquivo.yml` da `main`,
fonte `cd2c31aee`, integrada após os dois jobs da candidata `43876788875`.
A comparação do workflow com a fonte `e4fb56da5` não encontrou diferença.
Os jobs exigem repositório privado e token somente de leitura. Para repetir:

```sh
gh workflow run morada-arquivo.yml --repo informach/artes-3d --ref main
```

O disparo manual na main `43877122326` também passou nos dois jobs. Somente o
verificador e a correção do resumo da licença foram integrados na main privada;
fontes e animações concorrentes foram preservadas. Não copiar o pacote,
capturas ou credencial de leitura para o repositório público.

Uma recuperação operacional deve conferir esses mesmos hashes antes de
transferir para uma pasta versionada do volume e executar a validação do
servidor, conservando o pacote anterior para rollback. A presença de arquivo
na release não substitui a prova de download/validação nem a restauração dos
mundos. A licença comercial foi confirmada pelo titular; arte avulsa continua
restrita ao repositório privado.

[Evidência estruturada](evidencias/arquivo-arte-2026-11-16.json).

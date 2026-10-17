# Suíte Edi — instaladores e atualizações

Este repositório contém somente instaladores Windows x64 e manifestos de atualização da Suíte Edi. O código-fonte não é publicado aqui.

As ferramentas estão em desenvolvimento. A disponibilidade de um instalador não significa que todas as funcionalidades dos editores estejam concluídas. O uso das ferramentas exige conta e autorização de acesso à suíte; baixar o instalador não libera uma assinatura.

## Instalação e atualizações

Comece pelo **Edi Hub** na seção **Releases**. Uma versão completa contém o Hub, EdiAula, EdiCaptura, EdiFoto, EdiPDF, EdiSVG e `edi-release.json`.

O Hub e as ferramentas verificam o manifesto assinado com a chave Ed25519 da suíte, os hashes e os tamanhos dos arquivos antes de aceitar uma atualização. As chaves confiáveis são incorporadas aos aplicativos; eles não passam a confiar em uma chave nova apenas porque ela aparece neste repositório. Atualizações não encerram editores nem trabalhos abertos à força.

## Certificado de publicador Windows

Os instaladores **não possuem certificado Authenticode reconhecido publicamente pelo Windows**. A assinatura criptográfica das atualizações não substitui esse certificado. O Windows pode exibir avisos de publicador desconhecido ou bloquear a execução conforme suas políticas de segurança. Não desative proteções do sistema para contornar um bloqueio.

As verificações de atualização partem de uma cópia legítima já instalada. Para a primeira instalação, utilize somente a distribuição oficial indicada pelos responsáveis pela suíte.

## Versões

- Versões estáveis: `edi-vX.Y.Z`.
- Versões de teste: `edi-vX.Y.Z-beta.N`.
- Rascunhos e versões incompletas não são oferecidos aos aplicativos.
- Uma versão publicada não deve ser substituída por arquivos diferentes; correções recebem uma nova versão.

Consulte os planos e gerencie sua assinatura no [portal da Suíte Edi](https://edi.informach.com.br).

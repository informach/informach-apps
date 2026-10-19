# Review da proteção por senha

Estado vigente: perfil aprovado na jornada completa; [review consolidado](review-senhas-escolhas-divisao.md). O registro abaixo conserva a investigação e os estados anteriores.

18/10/2026. Correções implementadas; fluxo nativo de senhas passou. A rodada integrada falhou no encerramento anterior ao reinício; nova rodada em execução. Não constitui full review ou publicação.

## Achados reproduzidos

Probes com PDFs sintéticos reproduziram: `abc\0one` e `abc\0two` chegam como `abc` à fronteira C; uma senha iniciada por nulo produzia abertura vazia; `é` como senha de abertura podia obter privilégio administrativo quando o proprietário usava `Ã©`. O PDFium tenta a representação Latin-1 dos bytes UTF-8 como alternativa. Senhas novas com 128 bytes UTF-8 funcionavam no motor instalado, mas falhavam no PDF.js instalado, que limita a entrada a 127 bytes.

Fontes verificadas: código instalado de `@embedpdf/pdfium` 2.15.1 e `pdfjs-dist` 6.4.299; [implementação pública do PDFium](https://github.com/chromium/pdfium/blob/main/core/fpdfapi/parser/cpdf_security_handler.cpp). A correção não acrescenta normalização Unicode: entradas canonicamente equivalentes continuam distintas, conforme o comportamento efetivamente testado. Não se declara compatibilidade universal de criptografia.

## Correções

Contratos compartilhados e motor recusam nulo e Unicode inválido. Novas senhas exigem conteúdo e no máximo 127 bytes UTF-8, sem truncar; a interface apresenta o motivo antes de iniciar a criptografia. O par abertura/administração é recusado quando coincide pela compatibilidade Latin-1 observada. O limite em bytes para criação não foi aplicado retroativamente à abertura pelo motor.

Alterações e troca de proteção agora verificam autorização administrativa mesmo quando o PDF protegido abre com senha vazia. Isso não impede inspeção e leitura permitidas. O arquivo original continua intacto; a remoção autorizada da proteção conserva texto vetorial.

## Evidências e estado

Quatro testes novos verificam as recusas, origem intacta, privilégio administrativo, limite exato com Unicode, abertura/leitura independente pelo PDF.js e proteção de arquivo com senha de abertura vazia. O fixture versionado contém apenas texto sintético e senha de teste conhecida. Os **256 testes do app passaram**; tipos do app e Biome da frente passaram. Tipos do harness foram corrigidos para a API instalada do PDF.js, que não expõe mais `isEvalSupported`.

Probes preservados em `.cache/edipdf-analysis/probe-password-policy.txt`, `probe-password-utf8.txt`, `probe-password-pdfjs.txt` e `probe-password-alias.txt`; regressão em `test-passwords-all.txt`, `typecheck-passwords.txt`, `types-passwords.txt` e `biome-passwords.txt`. Em `native-passwords.txt`, o fluxo de senhas passou: recusa de excesso em bytes/equivalência e gravação de senha Unicode de 127 bytes, com abertura independente da cópia. OCR/conversões/autoria/impressão também passaram, mas o encerramento anterior ao reinício expirou. Essa rodada não recebeu aceite integral. O build normal foi restaurado (`build-passwords-normal.txt`).

O probe mínimo `probe-electron-exit.txt` encerrou com código zero; a causa da falha na jornada maior ainda não está estabelecida. O harness passou a observar imediatamente as duas promises de saída e registrar stderr/estado do processo em caso de falha, sem aumentar timeout ou transformar falha em sucesso. A rodada `native-choices.txt` repete senhas/reinício e acrescenta escolhas de formulários.

Pendências: aceite da jornada integrada/reinício, corpus externo amplo de revisões de criptografia, complementos do mapa de cobertura e full review. Certificados e serviços externos continuam excluídos.

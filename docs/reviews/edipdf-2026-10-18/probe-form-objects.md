# Objetos internos de Form XObjects — capacidade observada

18/10/2026. Probe reproduzível: `pnpm --filter @informach/edipdf exec node scripts/probe-form-objects.mts`. Usa PDFium 2.15.1 instalado, fixtures sintéticas e saída real relida pelo motor. Arquivos e JSON ficam em `.cache/edipdf-analysis/form-objects/`; não altera o produto nem constitui suporte já implementado.

Um Form com texto/desenho é colocado uma vez, ou três vezes compartilhando o mesmo recurso entre duas páginas. O probe tenta remover, mover e trocar o texto do filho com APIs públicas e regrava/reabre o documento.

| Operação direta no filho | Ocorrência única | Recurso compartilhado |
| --- | --- | --- |
| Remover | Texto removido após salvar | Texto removido de todas as ocorrências/páginas |
| Mudar matriz/posição | API retorna sucesso, posição salva permanece original | Posições salvas permanecem originais |
| Trocar texto com glifos existentes | API retorna sucesso, texto salvo permanece original | Textos salvos permanecem originais |

As APIs diretas não atendem ao contrato do editor: um retorno true não comprova persistência; alterar o stream compartilhado pode afetar pares que o usuário não selecionou. A implementação precisa isolar a ocorrência e regenerar seu conteúdo, preservando BBox/Matrix, recorte, recursos e ordem. Nenhum caminho deve remover o grupo e recolocar o filho no nível da página sem preservar essas propriedades. O [adaptador inicial](review-form-content-parcial.md) agora prepara uma página independente e reinsere o conteúdo em um recurso exclusivo; testes de clipping, instâncias compartilhadas, Unicode e roundtrip passaram. Interface e workers foram integrados; a jornada nativa ampliada está em execução, com perfis amplos ainda pendentes.

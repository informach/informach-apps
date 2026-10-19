# Review do lote 3 do EdiPDF

18/10/2026. Leitura, busca, interface, perfil/versões, navegação documental, anotações e AcroForm. A implementação dos fluxos descritos passa para o lote 4, com limites de compatibilidade explícitos. O [review intermediário](review-lote-3-parcial.md) detalha a fundação e os defeitos corrigidos durante a construção.

## Complementos concluídos

- Marcadores também podem ser reordenados, conservando os ramos. Destinos nomeados nas duas estruturas PDF são resolvidos; destinos cíclicos são recusados. Recontagem de marcadores evita percursos quadráticos e conserva ramos fechados. Links suportados podem ter área/destino editados em uma operação atômica.
- Campos existentes podem ser reposicionados/redimensionados e transferidos entre páginas, inclusive giradas, conservando valor e vínculo do widget. Campos com várias aparições permitem escolher qual alterar. Tabulação por linhas/colunas é gravada em `/Tabs` e aplicada na ordem HTML. O alinhamento existente é conservado ao configurar o campo.
- Assinatura desenhada conserva traços vetoriais, inclusive pontos, com um grupo para deslocar assinatura/data. Há giro antes de inserir e data opcional. Digitação/foto continuam como aparência raster. Guardar é uma escolha explícita e a assinatura guardada é protegida localmente; nenhum certificado é empregado.
- O harness foi consolidado em `apps/edipdf/scripts/native-journey.mts`, chamado por `pnpm edi:test:native edipdf`, sem alterar as jornadas dos outros apps. Ele gera seu PDF sintético no perfil temporário e verifica reinício real. Compilações com chaves efêmeras e restauração do build normal são executadas sequencialmente.
- Foco de modais com Tab/Shift+Tab foi conferido no Electron. A barra de ferramentas cabe na janela mínima de 1100 px; ações secundárias passam ao menu Ferramentas. Tema claro recebeu correção de contraste em avisos e overlays. A busca navega ao mudar consulta/opções e preserva a posição ao atualizar a revisão durante edição.
- Todo caminho de abertura web passa pela validação HTTP/HTTPS e confirmação, inclusive pedidos de nova janela. O SDK verifica `file:write-copy` antes dos efeitos e exige o fluxo autorizado quando a licença está restrita.

## Gates e evidências

- **67 testes do app**, typecheck e build normal aprovados. **52 testes do SDK** e seu typecheck aprovados. `pnpm edi:typecheck:tooling` aprovou a integração tipada da jornada. Biome focado sem erros; avisos legados não foram ocultados. Diff revisado e sem erro de whitespace.
- `pnpm edi:test:native edipdf` aprovado, incluindo inventário físico ASAR/EXE/receipt com rejeição de adulteração, lançamento Windows/árvore de acessibilidade, abertura de ferramenta portátil assinada pelo gerenciador, jornada do EdiPDF e reinício. Licença offline, expiração, modalidade do shield e negação de IPC permanecem ativas. A tentativa de `writeCopy` fora da recuperação autorizada foi negada antes da gravação.
- Reinício reabriu a sessão na página 2; recuperação preservou texto, formulário e assinatura; cópia sobre o caminho original foi recusada e os bytes do original continuaram iguais. Versões protegidas não continham o texto conhecido da fixture.
- Capturas de fixture conferidas: [leitura](lote3-leitura.png), [formulário/assinatura no tema claro](lote3-formulario.png), [recuperação após reinício](lote3-recuperado.png). Há também verificação automática da largura da toolbar e do foco modal. Isso não é homologação manual de todos os leitores de tela.
- O primeiro teste integrado parou na fixture compartilhada de lançamento GUI antes de abrir o EdiPDF. A execução direta dessa fixture passou sem alteração; a repetição completa também passou. Outra execução sofreu interferência de recompilação durante o teste; o build normal passou a ser restaurado somente depois do encerramento. Essas falhas não foram convertidas em evidência positiva nem escondidas por desativação de gates.
- Nenhuma instalação no sistema, publicação, operação de produção ou envio documental para serviço externo.

## Limites e próximos lotes

Ordem customizada arbitrária de tabulação, fontes externas de widgets, XFA dinâmico, estruturas muito grandes e leitores de tela específicos exigem a matriz/corpus final. Anotações têm clipboard interno; miniaturas recebem a revisão confirmada, não o rascunho aberto. Sugestão de campos reconhece sublinhados selecionáveis; digitalizações dependem do OCR do lote 4. Bloquear anotação não é criptografia.

As versões locais anteriores podem conter conteúdo depois redigido ou sanitizado; retenção/limpeza são explícitas, sem prometer eliminação de outras cópias. Recuperação atual é limitada a 160 MB por trabalho, e a cota configurada vale para versões. PDFs com `UserUnit` não padrão ficam em leitura para preservar medidas; XFA avançado não está homologado.

Permanecem obrigatórios os complementos de autoria/compatibilidade do lote 2, OCR, conversões, scanner/TIFF, comparação, automação/consulta/extração local, acessibilidade/PDF/A, recursos especializados e full review. Assinaturas com certificado e serviços externos continuam excluídos. Este review não declara substituição integral do Acrobat concluída.

# EdiCaptura

Aplicativo Electron para Windows com seleção de região e barra flutuante inspirada no fluxo do Snagit. Interface em português, sem serviços externos.

## Executar

Requisitos: Windows 10/11 x64, Node.js 22 ou posterior.

```powershell
npm.cmd install
npm.cmd start
```

No PowerShell, use `npm.cmd` se a política de execução bloquear `npm.ps1`.

## Recursos

- Capture a região do monitor em que está o cursor, com oito alças e campos de largura/altura em pixels.
- Em **Tela / monitor**, escolha um monitor específico ou o monitor onde está o cursor. A escolha é lembrada e também vale para os atalhos globais.
- A moldura azul fina permanece visível durante vídeo e rolagem, deixa passar cliques e é excluída da captura pelo Windows 10 2004 ou superior. Na imagem estática, fica visível até a captura ser concluída.
- Os controles mostram o monitor e as dimensões. Quando possível, ficam fora da região ou no outro monitor. Desconectar o monitor ou alterar sua resolução encerra a captura para evitar gravar a área errada.
- Use os botões da barra flutuante para imagem, vídeo ou rolagem assistida.
- Anote com setas, texto, retângulos, marca-texto, caneta e passos numerados.
- Pixelize uma região, recorte, mova ou exclua anotações e desfaça/refaça alterações.
- Copie a imagem final ou exporte PNG/JPEG. Projetos permanecem editáveis na biblioteca.
- Grave a região em WebM, sem áudio, por até cinco minutos. A janela de controle e Ctrl+Shift+F10 encerram a gravação.
- Na captura com rolagem, selecione somente o conteúdo que se move (evite cabeçalhos fixos), role para baixo em passos menores que uma tela e faça pausas de cerca de 2 segundos. O app captura os trechos estáveis e detecta automaticamente a sobreposição. **Pronto · unir imagem** salva uma única imagem vertical e abre no editor. Cada foto registrada toca um clique de câmera e exibe a confirmação para prosseguir. **Fotografar trecho** e Ctrl+Shift+PageDown permitem registrar manualmente. O campo de sobreposição vazio usa a detecção automática; um número aplica um corte manual igual a todos os trechos. Não há rolagem horizontal nem movimentação automática da página. Se não houver correspondência segura, o automático pede uma foto manual. A foto manual preserva o trecho inteiro (ou aplica o corte informado), avisa sobre possíveis repetições e permite finalizar a imagem.

## Atalhos

| Ação | Atalho |
|---|---|
| Nova captura | Print Screen ou Ctrl+Shift+S |
| Confirmar região como imagem | Enter |
| Cancelar seleção | Esc |
| Abrir imagem | Ctrl+O |
| Salvar projeto | Ctrl+S |
| Desfazer / refazer | Ctrl+Z / Ctrl+Shift+Z |
| Excluir anotação selecionada | Delete |
| Parar gravação | Ctrl+Shift+F10 |
| Próximo trecho da rolagem | Ctrl+Shift+PageDown |

O Windows ou outro aplicativo pode reservar Print Screen; nesse caso a interface mostra o atalho alternativo disponível.

## Dados e segurança

Os projetos ficam em `%APPDATA%/edicaptura/captures` (o diretório exato depende do nome de aplicativo atribuído pelo Electron). PNGs originais e anotações JSON são armazenados separadamente; vídeos são WebM. **Pixelizar protege a exportação visual, mas não elimina o original da biblioteca**: compartilhe a imagem exportada, não os arquivos do projeto, quando houver dados sensíveis. O app usa `contextIsolation`, sandbox, preload restrito e validação de origem no IPC. Não carrega conteúdo remoto.

Quando a licença deixa de autorizar o uso, vídeo e rolagem em andamento são encerrados e salvos; nenhuma nova captura começa. Se o disco falhar, os bytes/trechos continuam disponíveis para repetir **Salvar trabalho existente**. Antes de integrar um vídeo à biblioteca, o main grava uma cópia em `%APPDATA%/edicaptura/recovery`; ela só é removida depois do salvamento. A mensagem de erro informa o caminho quando a finalização falha. Uma falha do próprio disco pode impedir essa cópia: mantenha a janela aberta enquanto libera espaço. Exportações usam substituição atômica. Evidências em [preservação de jobs](../../docs/propostas/edi-suite-2026-10-16/producao-jobs.md).

## Testar e distribuir

```powershell
pnpm --filter @informach/edicaptura test
pnpm --filter @informach/edicaptura build
pnpm edi:test:native
pnpm edi:test:package --installer
```

EdiCaptura integra o release da suíte pela tag `edi-v*`, usando instalador, inventário e manifesto assinados Ed25519 e atualização pelo SDK compartilhado. Os antigos scripts `pack`/`dist` não são o canal comercial. Siga a [distribuição do piloto](../../docs/propostas/edi-suite-2026-10-16/distribuicao-piloto.md); as assinaturas próprias não equivalem a certificado Authenticode reconhecido pelo Windows.

O plano e os limites da versão estão em [PLANO.md](PLANO.md).

## Validação desta entrega

Versão 0.2.2: 36 testes passaram. Verificam linha de um pixel físico em escalas de 100% a 250%, janelas transparentes, tolerância a pequenas diferenças de renderização, captura manual sem alinhamento, união dos pixels e confirmação sonora somente para fotos novas. O teste nativo voltou a encerrar com Target crashed antes da interação; aparência e som no Windows real ainda precisam de confirmação. O sandbox permanece ativo.

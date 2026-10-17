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

## Testar e distribuir

```powershell
npm.cmd test
npm.cmd run test:e2e
npm.cmd run pack
npm.cmd run dist
```

`pack` cria `release/EdiCaptura-Windows-0.2.2/EdiCaptura.exe` e os arquivos necessários. `dist` gera `release/EdiCaptura-Windows.zip`. Distribua a pasta inteira ou o ZIP; o executável depende dos arquivos ao lado dele. A distribuição não tem assinatura digital nem atualização automática.

O plano e os limites da versão estão em [PLANO.md](PLANO.md).

## Validação desta entrega

Versão 0.2.2: 36 testes passaram. Verificam linha de um pixel físico em escalas de 100% a 250%, janelas transparentes, tolerância a pequenas diferenças de renderização, captura manual sem alinhamento, união dos pixels e confirmação sonora somente para fotos novas. O teste nativo voltou a encerrar com Target crashed antes da interação; aparência e som no Windows real ainda precisam de confirmação. O sandbox permanece ativo.

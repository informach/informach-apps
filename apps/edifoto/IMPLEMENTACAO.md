> Atualização de 16/10/2026: projeto consolidado em `APPS/EDIFOTO`, com o design em `edifoto.pen`. As referências a Documents e à separação das cópias abaixo são históricas. Consulte o README para executar a versão atual. O patch em `entrega/` é um registro anterior e não deve ser reaplicado.

# Implementação dos recursos do canvas EdiFoto

Esta cópia foi preparada a partir de `C:\Users\julio\Desktop\CRIECOMHELENAEJULIO\APPS\EDIFOTO` em 15/10/2026. O projeto original não foi alterado. O código atualizado está em `C:\Users\julio\Documents\EdiFoto`.

## Recursos acrescentados

- **Caneta (P):** clique cria ponto; arraste cria alças Bézier; Enter conclui; clique no primeiro ponto fecha; Escape cancela o rascunho; Backspace remove o último ponto. Traçados finalizados possuem pontos e alças editáveis. Alt separa uma alça; o painel permite converter canto/suave, remover ponto e abrir/fechar o traçado.
- **Formas (U):** retângulo com raio, elipse, triângulo, polígono, estrela e linha. Arraste para desenhar; Shift mantém proporção; Alt desenha a partir do centro. Dimensões, cores, preenchimento opcional, contorno interno/central/externo, lados e raio interno são editáveis.
- **Camadas vetoriais:** transformação, duplicação, mesclagem, opacidade, máscaras, histórico, persistência no `.edifoto`, renderização e exportação usam o mesmo documento do editor.
- **Seleção retangular (M), laço (L) e varinha (W):** seleção por arraste ou cor conectada, tolerância, inversão, máscara e exclusão de pixels. A seleção limita pincel e borracha. Ctrl+D desmarca; Ctrl+Shift+I inverte.
- **Carimbo (S):** Alt+clique define a origem na camada de pixels ativa; pincel clona os pixels com tamanho, dureza, fluxo e opacidade. Histórico reversível.
- **Desfoque local (R):** pincel sobre uma camada de pixels, com histórico reversível.
- **Remover fundo por cor:** cria uma máscara a partir das cores conectadas aos quatro cantos; pode ser refinada com pincel. É apropriado para fundos de cor uniforme. Não é segmentação semântica por IA.
- **Curvas de luminosidade:** cinco pontos de saída ajustáveis e interpolação linear na composição GPU, com máscaras e mesclagem.
- **Comparação lado a lado:** menu Exibir, seletores independentes para mesclagem e aplicação da versão escolhida.
- **Menu Filtro:** preto e branco, inversão, curvas, desfoque e remoção de fundo por cor.
- **Assistente/MCP:** ferramentas `add_vector`, `edit_vector`, `vector_mask`, `remove_background`, `compare_modes`; parâmetros validados e histórico compartilhado. A ferramenta de ajustes também aceita curvas.

Os recursos preexistentes de texto, ajustes, 27 modos de mesclagem, camadas, recorte, exportação e configuração de agentes foram preservados.

## Verificação

- `npm run typecheck`: passou.
- `npm test`: 11 testes passaram, incluindo geometria, transformação inversa, conectividade da seleção e validação dos comandos do agente.
- `npm run build`: passou.
- Página local de integração: 12 verificações vetoriais e 14 verificações de pixels passaram no navegador integrado. Incluem eventos de ponteiro, composição GPU, salvar/reabrir, undo/redo, bloqueio, máscara, carimbo, desfoque, seleção, curvas, PNG/JPEG/WebP e comparação.
- Integrações de arquivos e IA são simuladas **somente** na página de testes. A suíte valida os handlers internos; não valida autenticação ou respostas de provedores reais.
- A inicialização nativa do Electron foi bloqueada pelo Windows: o runtime copiado em `node_modules/electron/dist` possui uma ACL incompatível com o processo sandbox. Nenhuma permissão do sistema foi alterada.
- As capturas visuais do navegador não ficaram disponíveis (timeout da ferramenta). Os testes de composição por pixels e de DOM passaram, mas a revisão visual completa permanece pendente.

## Executar

No PowerShell, dentro desta pasta:

```powershell
npm install
npm run dev
```

A instalação recompõe as dependências no ambiente normal do usuário. A cópia de dependências usada nesta sessão permitiu compilar, mas teve a limitação de inicialização do Electron descrita acima.

Para rodar a suíte web de integração sem depender do Electron:

```powershell
node scripts/browser-check.mjs
```

Abra `http://127.0.0.1:5184/tests/browser/index.html`. A página executa os testes em um documento descartável e mostra os resultados. Ela não substitui a aplicação desktop e não usa conexões de IA reais.

## Limites e trabalho pendente

- Seleção semântica automática de céu/pessoas e remoção de fundo por IA requerem um modelo ou provedor específico; não estão implementadas nesta entrega.
- Validar o aplicativo nativo, os diálogos de arquivo e as conexões reais de Claude/Codex no ambiente desktop.
- Fazer revisão visual completa em tamanhos de janela diferentes.
- As alterações ainda precisam ser integradas ao projeto original se ele continuar sendo a cópia principal. O patch em `entrega/edifoto-recursos.patch` contém as alterações de código e testes, sem dependências, perfis ou arquivos gerados.

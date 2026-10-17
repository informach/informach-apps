# EdiFoto

O projeto principal está em `APPS/EDIFOTO`: `edifoto.pen` contém o design, `src/` o aplicativo, `resources/` os ícones e `tests/` os testes e imagens de referência. Execute os comandos abaixo nesta pasta.

Consolidação em 16/10/2026: o código, os testes e os recursos de `Documents/EdiFoto` foram conferidos por SHA-256 e já eram idênticos aos desta pasta. Os documentos `IMPLEMENTACAO.md`, `LEVANTAMENTO-PEN.md`, `ENTREGA-0.2.0.md` e os registros de `entrega/` foram incorporados como histórico; não reaplique o patch antigo. O arquivo `.pen` não depende de arquivos em Documents. A cópia antiga em Documents ainda não foi excluída.

Editor de fotos do dia a dia, no estilo do Photoshop, com foco em **modos de mesclagem** e com um **agente de IA** que edita junto com você.

Electron + React + TypeScript. A composição das camadas roda na GPU (WebGL2), com os 27 modos de mesclagem do Photoshop.

## Usar

```sh
npm install
npm run dev        # desenvolvimento
npm run shortcut   # compila e cria os atalhos "EdiFoto" na Área de Trabalho e no Menu Iniciar
```

Depois de mudar o código, rode `npm run build` (ou `npm run shortcut`) para o atalho abrir a versão nova.

## O que tem

- Camadas de imagem, texto, cor sólida, gradiente e **ajuste** (exposição, brilho, contraste, realces, sombras, temperatura, tonalidade, vibração, saturação, matiz, níveis, P&B, inverter), não destrutivas.
- **27 modos de mesclagem**, com prévia ao passar o mouse, miniaturas ao vivo dos mais usados e Shift + / Shift − para alternar. Opacidade e preenchimento.
- Máscaras (pintar, degradê linear/radial, inverter), pincel e borracha com dureza, fluxo, opacidade e modo.
- Mover, escalar e girar camadas; cortar com proporções; girar/espelhar e redimensionar a imagem; ajuste automático.
- Histórico com desfazer por passo (inclusive pintura), documento `.edifoto` com todas as camadas, exportar PNG/JPEG/WebP, copiar/colar imagem.

## Chroma key para imagens

Selecione uma camada de imagem desbloqueada e clique em **Remover fundo** no dock, ou **Filtro › Chroma key — remover fundo…**. A ferramenta adapta o recorte do EdiAula para imagens, preservando a resolução e a transparência existentes. Use **Detectar cor** ou o **Conta-gotas**, ajuste a preservação do objeto, a transição, os reflexos de cor e o recolhimento da borda. Inspecione **Original**, **Resultado** ou **Máscara**, com zoom de 100% e fundos claro/escuro.

O processamento é local e roda em segundo plano. **Cancelar** não altera a imagem; **Aplicar recorte** cria um passo no histórico, mantém a máscara existente e permite desfazer/refazer. A prévia mostra a camada antes da máscara e da mesclagem. Exporte em PNG para conservar a transparência. Fundos verdes/azuis uniformes oferecem melhor separação; roupas com a mesma cor do fundo podem exigir retoques.

Teste de integração: execute `node scripts/browser-check.mjs` e abra `http://127.0.0.1:5184/tests/browser/index.html?suite=chroma`. O teste usa uma imagem sintética e verifica prévia, cancelamento, aplicação, máscara, histórico e persistência.

## Agente de IA

Duas formas, as duas com a sua assinatura:

1. **Agente externo (igual ao pen):** o EdiFoto abre um servidor MCP local em `http://127.0.0.1:47331/mcp`. Em *Editar › Inteligência artificial*, clique em **Conectar** no Claude Code ou no Codex (ou copie a configuração para o Claude Desktop). Você conversa lá e vê as edições acontecendo no EdiFoto.
2. **Chat dentro do app** (botão *Assistente*): usa o seu Claude Code ou Codex instalados, rodando sem terminal, ou uma chave da API da Anthropic.

O agente enxerga a imagem (`get_preview`), compara modos de mesclagem numa folha de contato (`preview_blend_modes`), mede luz e cor (`analyze_image`) e edita com camadas, máscaras e ajustes. Cada pedido vira um passo no Histórico. Por padrão ele pede confirmação para apagar camadas e não pode salvar arquivos (dá para liberar nas configurações).

## Verificações

```sh
npm run typecheck
npm test                                   # partes puras (modos, esquemas das ferramentas, documento)
scripts/snapshot.sh out.png tests/app/blend-accuracy.js   # modos na GPU × fórmulas de referência
scripts/snapshot.sh out.png tests/app/ai-tools.js         # ferramentas do agente de ponta a ponta
scripts/snapshot.sh out.png tests/app/paint.js            # pincel e máscara
```

`scripts/snapshot.sh` roda o app em modo de desenvolvimento com um perfil descartável (`.tmp/profile`), executa o script na janela, salva um print e fecha.

> Atualização de 16/10/2026: projeto consolidado em `APPS/EDIFOTO`, com o design em `edifoto.pen`. As referências a Documents e à separação das cópias abaixo são históricas. Consulte o README para executar a versão atual. O patch em `entrega/` é um registro anterior e não deve ser reaplicado.

# EdiFoto 0.2.0 — implementação e limites de entrega

15/10/2026. Código e build: `C:\Users\julio\Documents\EdiFoto`.
Atalho: `C:\Users\julio\Documents\EdiFoto - Nova versao.lnk`.

## Implementado nesta etapa

- Busca por nome e filtro por tipo de camada, com estado vazio.
- Caneta: mover pontos do rascunho e suas alças; Ctrl move o primeiro ponto sem fechar o desenho; controle explícito de alças vinculadas/independentes; modo traçado sem preenchimento ou forma preenchida.
- Controles superiores de aparência editam o vetor selecionado e atualizam os padrões de criação. Botão para iniciar novo desenho sem editar o anterior.
- Formas: seis botões visuais, transparência própria do preenchimento, contorno preservado opaco, raio/rotação/opacidade/alinhamento na barra superior, oito alças na ferramenta Formas. As alças laterais alteram largura ou altura em torno do centro.
- Painel contextual de vetores junto da lista de camadas, campo de nome e coordenadas identificadas como centro X/Y.
- Status RGB · 8 bits, versão 0.2.0, objeto ativo e dicas contextuais.
- Assistente: botões de comparar mesclagens e desfazer por resposta. Desfazer fica indisponível quando existem alterações posteriores, outro documento ou execução em andamento.
- Configuração: guia de conexão do Claude Desktop que preserva outros servidores; trecho TOML; estado “Configurado” separado da afirmação de conexão em uso. A detecção verifica a porta configurada desta versão.
- Perfil novo separado; porta MCP padrão 47332 para o atalho novo, evitando colisão com o aplicativo antigo em 47331. A URL correta aparece nas configurações.

## Verificado

- Typecheck TypeScript: passou.
- Testes unitários: 11 passaram.
- Build de produção: gerado.
- Navegador integrado: 40 verificações passaram (12 vetoriais, 14 raster e 14 de paridade). Incluem interação por ponteiro, renderização GPU, opacidade separada, persistência, busca/filtro, redimensionamento lateral e proteção do desfazer do assistente.
- Revisão visual do painel: realizada; corrigida altura dos botões de formas.

Os testes web usam uma ponte nativa simulada. Não validam autenticação real, diálogos nativos ou inicialização do Electron. A captura do painel não substitui a revisão em todos os tamanhos de janela.

## Bloqueios que permanecem

1. **Electron:** a inicialização por esta sessão ainda encerra em `install_dir_access.cc:52`, alegando ausência de acesso ALL APPLICATION PACKAGES. Isso acontece mesmo com a entrada de leitura visível na ACL do runtime copiado. Não foi desativada a sandbox nem alterada a instalação original. É necessário confirmar a abertura pelo usuário fora da execução automatizada; não há janela nativa validada nesta entrega.
2. **Segmentação de céu e fundo por modelo:** não implementada. A instalação de `@huggingface/transformers` foi recusada pela rede (`EACCES` no registro npm). A tentativa foi interrompida, sem adicionar dependência incompleta. Remover fundo continua explicitamente baseado na cor dos cantos.
3. **Conexões reais de IA:** ainda requerem teste no aplicativo nativo. “Configurado” significa que o cliente tem a URL correta registrada; atividade operacional continua sendo indicada pela execução de ferramentas.
4. **Integração ao original:** a árvore no Desktop não foi alterada. O atalho novo usa a cópia em Documentos e não migra automaticamente preferências/chaves ou substitui atalhos antigos.

Para a futura segmentação, a documentação consultada confirma máscaras semânticas do SegFormer e máscara de primeiro plano do [BiRefNet ONNX](https://huggingface.co/onnx-community/BiRefNet-ONNX/blob/main/README.md). A integração deve baixar os modelos, processar localmente e aplicar máscaras editáveis; isso ainda precisa ser implementado e testado, não apenas configurado.

## Como identificar a versão

Abra o atalho em Documentos. Com um documento aberto, procure **EdiFoto · 0.2.0** na barra inferior e as ferramentas Caneta/Formas na lateral. A versão anterior aberta pelo atalho antigo não recebe essas mudanças.

Se a abertura falhar, o atalho registra diagnóstico em `.tmp/electron-atalho.log`. O perfil está em `.perfil-nova-versao`; os documentos existentes permanecem em seus locais e podem ser abertos pelo menu Arquivo.

Este documento atualiza o estado de implementação do levantamento `LEVANTAMENTO-PEN.md`; o levantamento permanece como registro do que faltava antes desta etapa.

# Incremento 5.23 — joysticks 2D

Estado: incremento 5.23 implementado e revisado localmente em 18/10/2026. Projeto v22/Rig v4/blueprint v11 são versões reais do contrato, não aliases sob cabeçalhos antigos. Os resultados anteriores ao 5.23 não homologam esta capacidade; a publicação comercial da suíte tem gate separado.

## Lacuna e perfil inicial

I06 prevê joysticks; o núcleo já tem alvos, FK/IK/restrições, parâmetros tipados, canais e bindings, mas não um controlador 2D autorável. Acrescentar um controlador real, não uma imagem de um pad nem dois sliders sem vínculo com a cena. O primeiro perfil deve controlar um alvo raiz existente, com eixos normalizados x/y, extensões locais explícitas e limite quadrado ou circular. Alvos e constraints existentes podem usar esse ponto; a posição de referência e a animação do centro continuam separadas do deslocamento do joystick.

Usar o mesmo contexto de parâmetros e avaliador: valores x/y vêm de base/canais/bindings, são limitados conjuntamente quando circular e deslocam o alvo antes da cinemática/restrições. Uma definição por alvo, referências/limites validados, posse de canais explícita, sem interpretar scripts nem depender de ponteiros para funcionar. Definir as interações com parenting/basis, centros animados, constraints e limites numéricos antes de publicar o contrato. Perfis além desse primeiro alvo/controlador continuam explícitos, sem afirmar equivalência integral aos joysticks do Rive.

## Integração obrigatória

Mudança de formato precisa ser versionada em Rig/projeto/blueprint, preservando arquivos anteriores, backup/migração e recusas de capabilities em versões antigas. Não gravar campos novos sob cabeçalhos antigos. Orçamentos, cópia/dependências/IDs, remoção, locks, snapshots, histórico, timeline, instâncias independentes, bindings e MCP devem compreender o controlador; não implementar apenas seu painel.

Interface React com valores dos dois eixos, nome/limites e pad 2D. Arraste é draft local, um commit ao concluir; Escape, perda de captura, blur/desmontagem e falha de transação cancelam sem histórico parcial. Fornecer teclado e campos numéricos reais para ambos os eixos; não anunciar um slider unidimensional fictício. Autoria, animação/Testar e exportações devem usar o mesmo resultado do núcleo, sem estado global ou relógio paralelo.

## Gates e review

Primeira unidade de trabalho: joystickSchema estrito/inferido, resolveJoystickAxes e evaluateJoystick no domínio rig. Eixos solicitados ficam em [-1,1]; projeção circular conjunta ocorre após composição, preservando os valores de origem, e extensões locais podem diferir. Contador compartilhado com custo constante de oito unidades, entradas não finitas/fora do perfil recusadas. Três testes focados passaram para contrato estrito, centro/cardinais/cantos, extents distintos, custo, posse e entradas inválidas.

Integração inicial: Rig v4 acrescenta até 256 joysticks e canais x/y; uma definição por alvo raiz local, sem osso/constraint escrevendo o mesmo destino. Campos de joystick, inclusive array vazio, são recusados sob versões antigas. Alvo pertence a rig.targets e não pode ser componente/filho; offsets somam ao centro TRS do frame antes de IK/constraints, sem acumular o frame anterior. Kinematics valida a posição local resultante nos limites existentes, sem clamp silencioso do centro. Contagem de controles inclui os dois eixos, remapRig remapeia os alvos e rigOwners informa locks. Candidatos projeto v22 e blueprint v11 preservam o header anterior como aceito, mas recusam Rig v4 sob headers antigos. Playback permanece v3 com Rig explicitamente versionado.

Quatro testes focados adicionais passaram: centro animado + parâmetros antes de IK, limite acoplado/alcance inalcançável, canais/custo/ownership/remap/versionamento e recusa atômica de posição/budget. Sete testes focados no total e tipos de app/núcleo passaram. Isso ainda não certifica migração, UI, bindings, cópia/exclusão ou exportações; os demais consumidores/writers estão sendo integrados antes dos gates completos.

Context7 resolveu Zod e consultou /colinhacks/zod/v4.6.5, a versão indexada mais próxima da 4.6.7 instalada. Strict objects/refinements/tipos inferidos seguem as APIs já usadas no repositório; nenhum upgrade de dependência ou normalização silenciosa de campos desconhecidos.

### Direção do controle no inspetor existente

Pessoa/tarefa: quem anima personagens precisa posicionar um alvo e criar poses rapidamente, vendo limites e coordenadas sem trocar de ferramenta. Vocabulário: alvo, pose de referência, eixos, centro, envelope de movimento, canais e constraints. O painel será técnico e compacto, integrado a Rig, sem redesenhar a tela.

Cores vêm dos tokens existentes: grafite --bg, carvão --panel/--panel2, ardósia --muted, tinta clara --text e menta --mint para ação/foco. Hierarquia por superfícies/bordas discretas, Inter/Segoe UI existentes e espaçamento em múltiplos de quatro. A assinatura é o pad ligado a um alvo nomeado, com centro, envelope, ponto efetivo, valores X/Y e acesso direto aos canais do mesmo controlador.

Três defaults substituídos: pad decorativo por estado real do alvo; sliders independentes com histórico por evento por draft 2D e um commit; nova sidebar/cartões por extensão do inspetor já usado. Dois campos numéricos/teclado permanecem controles reais; o desenho 2D não anunciará um slider unidimensional falso. Usar os selects/formulários existentes mantém consistência e teclado nativo, sem introduzir outro sistema de dropdowns. Antes de escrever cada componente, registrar intenção/paleta/profundidade/superfícies/tipografia/espaçamento e conferir o resultado visual segundo a skill de interface.

Testar centro/limites/cantos/círculo, blend/interrupção/canais/bindings, composição com TRS e IK, orçamento, entradas inválidas, ciclos/órfãos/locks, cópia/remoção, persistência/migração e rollback. Conferir teclado/pointer/cancelamento no browser real, equivalência entre editor/HTML/React/SVG amostrado e perfis de exportação admitidos. Repetir tipos/unidades/build/regressão, Next e jornada Electron. Fazer review de arquitetura, segurança, acessibilidade e mensagens antes de fechar.

## Implementação integrada e evidência atual

O painel React de Rig cria, atualiza e remove controladores ligados a alvos raiz livres. Pad 2D, campos X/Y e teclado mostram o ponto solicitado e o ponto efetivo após projeção circular. O arraste mantém um draft local: o avaliador compartilhado faz a prévia de IK/skin sem salvar; soltar confirma uma transação e um passo de histórico. Escape, cancelamento/perda de captura, blur, mudança de viewport e desmontagem restauram o documento e a cena. Durante o review foi corrigida uma corrida em que soltar imediatamente após redimensionar podia confirmar antes do evento `resize`; a geometria da superfície é conferida também no próprio término do gesto.

O mesmo controlador entra nos parâmetros tipados, canais, bindings, playback, cópia/remapeamento, dependências de exclusão, locks e inspeção MCP. Eixos de instâncias são independentes. O arquivo antigo mantém backup exato e os cabeçalhos antigos recusam Rig v4, inclusive quando uma lista nova está vazia; versões anteriores continuam aceitas no parser. HTML interativo, SVG portátil, SVG amostrado, Lottie no perfil admitido e React/Next usam o mesmo frame do núcleo, sem uma segunda cinemática de exportação.

Gates aprovados após a última alteração funcional: 136 testes do núcleo, 245 do app, 82 E2E reais em Edge, tipos do app e núcleo, build do app, build/SSR/hidratação de consumo React em Next de produção e comparação independente de pixels no Lottie SVG-light. O corpus inclui avanço e busca para trás de ambos os eixos com IK e skin vetorial, edição/cancelamento/undo/reload, orçamento, cópia e rejeições de perfil. Auditorias de dependências de produção e desenvolvimento não relataram vulnerabilidades conhecidas; Biome no escopo app/núcleo aprovou 491 arquivos com 14 warnings e 9 infos legados visíveis. A jornada Electron/ASAR completa passou após corrigir duas falhas do harness: hosts de runtime cobrindo o pad e busca global de diálogos UIA. Conferiu prévia real, cancelamento, um passo de histórico, foco, exportações, Save/Open, recuperação, licença e IPC com perfis isolados; nenhum instalador foi publicado por esse teste. A captura visual do pad foi inspecionada em `.cache/edi-native-results/edisvg-joystick.png`.

## Limites que permanecem

O perfil implementado controla um alvo `g` raiz por joystick com deslocamento local e envelope quadrado/circular. Não equivale a todos os controladores/joysticks do Rive: não há joystick aninhado, escrita compartilhada no mesmo alvo, resposta procedural livre, manipulação de bone diretamente nem serialização `.riv`. Posições fora do perfil recusam em vez de serem truncadas. A representação SVG/Lottie amostrada só promete os quadros e tolerâncias declarados pelo exportador; não identidade contínua nem precisão universal de consumidores float32. React Native não foi implementado ou homologado.

Restante dos gráficos/tipografia/raster/formatos/semântica/scripting do lote 5 e React Native/bibliotecas/compartilhamento/colaboração/acervo do lote 6 permanecem obrigatórios. O [full review desta entrega](full-review-2026-10-18.md) consolida os limites e a decisão de escopo. Erros concorrentes EdiPDF e warnings legados não foram ocultados nem declarados resolvidos pela homologação do EdiSVG.

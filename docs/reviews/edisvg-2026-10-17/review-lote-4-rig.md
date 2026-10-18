# Review incremental 4.1 — ossos, vínculos e restrições

Base `88c1163`, branch `feat/edisvg-evolution`. Lote 4 em execução. Não é fechamento do lote nem full review final. Documento do editor v13; playback v3 somente quando há rig. Nenhuma publicação, commit/push ou deploy executados.

## Implementação atual

- Grupos reais da cena representam ossos e alvos com IDs estáveis; metadados de rig guardam comprimentos, limites e restrições, sem duplicar a pose de referência. Design edita a referência; Animar/Testar avaliam a pose. Projetos v1–v12 passam pelo migrador/backup existentes.
- FK respeita a hierarquia e matrizes do modelo. IK de dois ossos é analítico; cadeias maiores usam seed analítico distal e CCD limitado. Perfil atual: 1–8 ossos contíguos, escala uniforme positiva, pivôs/skew/atributos neutros nas juntas internas; o espaço da base pode ser afim invertível. Perfis incompatíveis são recusados, não aproximados silenciosamente.
- Força 0/80/100%, sentidos de dobra, limites e alvos inalcançáveis testados. Diagnóstico distingue convergência do solver e erro da pose após influência parcial, com `strength`, `solvedResidual` e `residual`. Força zero é desativação, não falha de alcance.
- Distância mínima/máxima e cópia de transformação local/global. Decomposição afim preserva reflexão, pivô e shear representável. Dependências são ordenadas; feedback/ciclos são recusados. Múltiplos escritores seguem ordem autoral; reordenar também respeita bloqueios.
- Um avaliador de playback completo atende canvas, HTML, runtime e SVG amostrado. Componentes remapeiam os ossos/refs, preservando rig e relógio locais. Rig estático é avaliado sem criar uma animação fictícia. Exportação que conserva rig não exige consentimento por uma perda inexistente; formatos que realmente descartam lógica/layout continuam exigindo confirmação.
- O solver recebe as matrizes reais dos slots de layout; reflow recalcula a solução. Medição usa poses de referência, não os offsets animados; glyphs do editor não alteram o tamanho de fluxo. Ossos internos não devem receber fluxo que rompa a continuidade da cadeia IK.
- Ferramenta Osso/B desenha por arraste, cria filho na ponta do osso selecionado (Alt inicia outra raiz), cancela sem histórico e publica uma transação guardada por sessão/revisão. Formulários permitem criação por teclado, configuração, alvos e restrições. Canvas usa glyphs próprios, selecionáveis, fora do documento/export.
- Vínculo rígido exige confirmação de preservar apenas a pose de referência, acrescentando influência futura do osso. Não relaxa a política de preservação de movimento do reparenting comum. Undo/Redo, locks e referências continuam compartilhados com MCP.
- `get_rig` pagina IDs; `get_rig_value` lê JSON exato em trechos. Comandos `rig` entram em `edit_document`. Leitura de JSON por chunk foi consolidada com layout, sem usar previews em substituições.
- Limites: 256 ossos/restrições/alvos por definição; expansão até 1000 ossos/256 restrições, 128 escopos e 2000 objetos. Avaliação possui orçamento numérico; não há loops ou convergência sem limite. Erros de prévia interrompem reprodução e exibem diagnóstico preservando o documento.

## Evidências atuais

- 130 testes do editor e 41 do núcleo passaram. Tipos do editor/núcleo e build passaram.
- Três novas jornadas de navegador passaram: autoria real de ossos/IK, cancelamento/Undo/Redo/reload/Testar sem alterar referência; IK com slots de layout e redimensionamento; equivalência entre runtime interativo, HTML offline e SVG nos quadros amostrados do documento.
- Rig em componente com velocidade própria, binding mantendo matriz mundial de referência, duplicação de artboard, inspeção paginada, export estático e falhas atômicas têm regressões de domínio.
- A rodada conjunta ampliada/Next, verificação visual e nova jornada Electron do conjunto do lote 4 ainda devem ser registradas. O Electron aprovado no incremento 3.3 não certifica estes recursos novos.

## Continuidade obrigatória do lote 4

Ainda faltam canais animáveis de parâmetros do rig, seguir caminho, malha/pesos/deformação, morph, solo/expressões e a integração completa dessas capacidades em UI/MCP/exportações. O perfil IK atual tem limites declarados; não é prova de equivalência integral com o Rive. Scripting/assets/render avançado e React Native continuam nos lotes 5/6. Não apresentar helper/schema ou prova matemática isolada como recurso de autoria concluído.

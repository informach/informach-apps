# Incremento 5.17 — duplicação de deformadores e rig

Estado: incremento revisado localmente no perfil limitado documentado. O review 5.16 foi fechado antes deste incremento. Demais requisitos dos lotes 5/6 e full review continuam obrigatórios.

## Implementação e provas atuais

`rigClone.ts` fica junto do domínio de rig, conforme a skill project-structure; o comando de duplicação único/batch passa pelo mesmo `executeDocumentTransaction`. Preflight exige fechamento de referências de restrições/skin dentro de um mesmo subtree copiado, e solo completo; copiar só um filho de solo ou parte de uma cadeia/mesh recusa sem publicar. Trim/morph locais podem ser copiados isoladamente. IDs de controles, canais e chaves são renovados; bones/targets/constraint owners/targets/chain, pesos de skin e children de solo são remapeados. Relógios/clips existentes permanecem compartilhados, sem alterar o formato v21/Rig v3/blueprint v10.

Matrizes de referência não são recapturadas. Num subtree fechado, mesh e ossos recebem a mesma translação mundial adicional, que cancela em `inverse(meshWorld) × boneWorld`; o produto inverse-bind/bind original permanece válido. Testes com IK, grupo animado, skin vetorial, reflexão/skew no pai e controles Bézier verificaram poses/pontos/alças na cópia com a translação esperada, inclusive em retorno de tempo. Perfis incompatíveis continuam recusados antes de mutar a cópia. Isso não amplia o perfil IK para reflexões/skew: a prova afim de skin não usa IK, conforme o contrato existente.

Bindings/listeners recebem IDs/destinos próprios, mantendo inputs/dados da mesma prancheta compartilhados explicitamente. Máscaras de owner das camadas incluem os objetos correspondentes da cópia; não se cria máquina independente. Para estado isolado, usar componentes. Limites de rig/canais/chaves/bindings/listeners são verificados; locks e falha em transação mista preservam a origem. O primeiro teste de serialização diferenciava -0 de 0 em matrizes inverse-bind: JSON canoniza esses números. A prova agora compara o conteúdo serializado completo, além de conferir as matrizes mantidas em memória; não foi alterado o algoritmo de skin para passar o teste.

Tipos e seis testes focados passaram, incluindo fontes originais, refs/canais/keys, camadas/bindings, locks/excesso/atomicidade, morph/solo, IK/skin e pais afins. UI real de duplicação com undo/reload, dois players geométricos, listener de botão copiado por Enter/Space e ZIP React independente também passaram. Gates completos/Next/Electron e review final do perfil ainda pendentes; não equivalem ao full review dos lotes.

## Problema e contrato inicial (histórico)

Duplicar apenas a geometria de um objeto com trim/morph/solo ou skin pode perder seus controladores, canais e bindings. No perfil 5.16, cópias parciais com trim são recusadas; duplicar a prancheta inteira já remapeia o conjunto. O próximo passo deve preservar relações de forma tipada e atômica, pela mesma transação de autoria, sem bake silencioso da deformação nem recaptura automática de bind pose.

Controladores copiados precisam de IDs próprios; canais/keyframes devem ser renovados e continuar nos clips/relógios correspondentes. Bindings e máscaras de camadas precisam apontar aos destinos copiados. Referências externas/skins/restrições requerem análise explícita: não basta trocar targetId ou recapturar bind matrices, pois isso pode mudar a pose atual ou a influência futura. Um subrig fechado num grupo com todas as referências preserva relações de espaço; uma seleção parcial pode não fazê-lo.

Investigar primeiro os deformadores locais e suas dependências; perfis complexos só serão liberados com prova da matriz de referência e das poses sob animação/reflexão/skew. Entradas originais, histórico, limites, locks e fontes de efeitos devem permanecer preservados. Exportações e instâncias precisam reproduzir o conjunto copiado sem um segundo avaliador.

## Gates

### Fechamento local do perfil

Após a última correção, passaram 203 testes do app, 121 do núcleo, 68 E2E seriais, Next 16.4.2 produção (build/SSR/hydration), tipos do app/núcleo, 43 testes de tooling, sintaxe/build e Biome focado (447 arquivos, zero erros, 15 warnings/9 infos legados). A jornada Electron completa passou com exit 0. O teste combinado de restrição de caminho/Rig v3 inclui undo/redo/reload; o ZIP React verifica a cópia de trim fora do workspace. IDs/canais/bindings, fechamento de referências, pose de referência, orçamento/locks/atomicidade e fontes originais foram revisados. Registros abaixo descrevem os achados e as rodadas intermediárias, não pendências desses gates do perfil.

O checkout inteiro não está aprovado: permanecem dois alertas altos via EdiPDF na auditoria de produção e 11 erros novos de tipos no arquivo concorrente `apps/edipdf/src/shared/pdf-annotations.ts`, alcançado pelo tooling transversal. Nenhuma exceção, supressão ou alteração da frente concorrente foi aplicada. Próximo incremento: [5.18 — entrada SVG](review-lote-5-entrada-svg.md); demais requisitos continuam rastreados no plano.

### Achado adicional de integração: versão monotônica

Atualização posterior no 5.18: auditorias de produção/desenvolvimento repetidas retornaram zero vulnerabilidades conhecidas, sem muted/exceções. A frente concorrente adotou override `pptxgenjs@4.0.1>image-size: 2.0.3`. Não foi alteração EdiSVG e a auditoria não certifica a compatibilidade desse override; conferir os gates da frente EdiPDF. Os 11 erros de tipos concorrentes persistem na repetição. Alertas registrados abaixo são o estado histórico das rodadas 5.17.

O review encontrou um writer legado do painel de restrições que atribuía v2 ao salvar uma restrição de caminho, mesmo num Rig v3. O parser recusava o documento com trims, impedindo a edição sem perder o projeto. `upgradeRigVersion` centraliza a regra monotônica nos writers de restrições, parâmetros, morph/solo, skin e trim; não relaxa o schema de formatos antigos. Os nove pares de versões suportadas passaram no teste do núcleo. A regressão real combina path constraint, morph/solo, canais e trim, com histórico/recarga. Sua primeira execução descartou a cópia da fixture porque faltava aceitar o diálogo de recuperação; o teste foi corrigido para usar o fluxo real de recuperação, sem mudar a proteção do produto.

A rodada anterior completa passou com 203 testes do app, 120 do núcleo, 67 E2E e Next produção. Depois da correção monotônica, o núcleo passou com 121 testes; repetir a regressão e a jornada Electron antes de fechar este incremento. Auditoria de produção permanece bloqueada pelos dois alertas altos concorrentes via EdiPDF; nenhuma exceção ou alteração cega de dependências foi aplicada.

A nova jornada Electron realizou importação, autoria e duplicação, mas seu helper esperava “Pausar teste” numa prancheta sem animação, cujo player fica corretamente ocioso. O helper agora espera prontidão por Resetar e verifica “Reproduzir teste”, sem acrescentar delay ou alterar o scheduler. Repetição completa em andamento. Os tipos do app/núcleo passaram; a nova execução de tooling transversal encontrou 11 erros em `apps/edipdf/src/shared/pdf-annotations.ts`, arquivo concorrente fora desta frente. Não atribuir o gate histórico limpo ao checkout atual. App (203), tooling (43), sintaxe e Biome focado passaram depois da correção monotônica; 15 warnings/9 infos legados continuam visíveis.

Repetição Electron completa concluiu com exit 0: duplicação pela UI, dois comprimentos reais de 100 unidades, controladores distintos, restauração exata de três edições, demais journeys de rig/assets/semântica/importação, Save/Open/Cancel/recovery, ZIP React, três perfis Lottie Save/Cancel e licença/expiração/IPC. Screenshot `.cache/edi-native-results/edisvg-rig-clone.png` inspecionada. Nenhum instalador foi instalado/publicado. A última regressão completa de navegador/Next após a correção monotônica está em execução.

ID/ref remapping, canais/bindings/blends, deformação e rest pose, duplicação de grupo/seleção com fontes internas/externas, excesso/cancelamento/atomicidade, UI/history/reopen, HTML/React/Next e Electron; documentação e review antes de declarar o perfil concluído. Não encerra lote 5, lote 6 ou full review.

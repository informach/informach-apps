# Review incremental 3.3 — componentes independentes

Base integrada: `88c1163`, branch `feat/edisvg-evolution`. Código em andamento, sem commit/push, publicação ou deploy. Este registro complementa os reviews 3.1/3.2 e não é o full review final.

## Implementado e revisado

- Documento do editor v12, migrando v1–v11 pelo fluxo existente com backup exato antes de substituir o original. Instâncias configuram máquina inicial e overrides escalares de inputs; validação de referência/tipo/read-only ocorre na mesma transação de UI/MCP.
- Blueprint interativo v2 para cenas com componentes independentes; v1 continua aceito para cenas sem essa extensão. Cada componente possui contexto/sessão de estados, inputs e dados próprios; destinos/IDs compilados são locais, com identidade pública pelo caminho autoral da instância.
- Um único RAF, política de visibilidade/movimento reduzido e coordenação temporal da cena. Avanço prepara/valida todos os escopos antes de publicar; notificações ocorrem após todas as sessões terem sido atualizadas. Falha no último componente não avança a raiz ou irmãos. Callbacks não podem escrever reentrantemente em outro escopo.
- `getComponent(instancePath)` expõe controles locais, inclusive dados, máquina, reset, diagnóstico e avanço manual. Root pause é transporte global; avanço manual funciona pausado. Eventos agregados incluem `instancePath`. React expõe controles de componente por ref e o ZIP conserva o contrato tipado portátil.
- Layout de componente recalcula no viewport lógico alocado pelo pai, sem simplesmente esticar sua arte. Canvas usa unidades da prancheta; Testar/HTML usam tamanho real do host. Descarte remove slots/listeners/observers e restaura viewports.
- Testar permite inspecionar componentes e editar seus modelos/listas; alterações são somente da sessão. Trocar máquina não remonta o runtime nem perde dados. Reset retorna aos inputs/dados iniciais locais, preservando a definição da origem.
- Limites agregados antes de aceitar o blueprint: 128 escopos/8 níveis, 2000 objetos, 12000 trilhas/100000 chaves, 20000 entidades de lógica, preflight estrutural/textual; por avanço, 512 eventos e 2000 linhas de texto. Velocidade efetiva acumulada até 100; cada avanço efetivo aceita até 10 segundos. Offset exige zero no perfil independente, sem inventar equivalência com fases de máquinas de estados.

## Achados corrigidos durante o review

1. Testar/Exportar consideravam só a raiz: agora percorrem os componentes alcançáveis e não descartam lógica aninhada silenciosamente. Conversão para formatos de animação continua exigindo consentimento explícito.
2. Inputs iniciais podiam vazar em leituras MCP extensas: `get_component` pagina e limita previews; `get_component_value` com `property=input`/`targetId=inputId` fornece JSON exato em trechos, com tamanho/continuação explícitos.
3. Avanço manual após pausa era indevidamente bloqueado pelo flag de transporte: separado avanço explícito de autoplay. Teste confirmou avanço apenas do componente quando solicitado localmente.
4. Hierarquia DOM no viewport aninhado era confundida com a hierarquia de autoria: limites de ownership agora normalizam corretamente as raízes locais.
5. Erro síncrono de paint podia apenas chamar onError e retornar um player aparentemente pronto: montagem/operações síncronas propagam a falha após reportá-la; falhas assíncronas continuam interrompendo o scheduler. Regressão em navegador real cobre ambas as operações síncronas e descarte idempotente.

## Evidências

- 127 testes do editor e 35 do núcleo aprovados; typecheck transversal (23 tarefas + tooling) aprovado.
- Rodada conjunta de 15 E2E aprovada: inclui duas instâncias com estados/dados separados, avanço transacional, reflow aninhado, Testar real, edição bidirecional de dados, HTML baixado offline, React StrictMode e ZIP React em consumidor TypeScript separado.
- Prova Next.js 16.4.2 repetida e aprovada: Turbopack de produção, pré-renderização, hidratação e controles, sem ssr:false/suppressHydrationWarning ou runtime do workspace.
- Rodada posterior de 16 E2E e Next.js aprovada após a correção do scheduler; build aprovado. Check focado em 69 arquivos sem erros/warnings. O check global encontrou erro de formatação em `docs/reviews/edifoto-2026-10-18/evidencias.json`, criado por outra frente durante esta execução; arquivo preservado, sem alegar aprovação global.
- Jornada Electron repetida e aprovada após o build: GUI/licença, inventário/integridade, Worker isolado e Yoga/WASM sob file-origin/CSP, Save/Open/Cancel/recuperação, ZIP binário Save/Cancel preservando o documento/original, licença offline e bloqueio por expiração/IPC. Chaves efêmeras/perfis isolados; nenhum instalador instalado/publicado.

## Continuidade obrigatória

Nine-slice ainda tem apenas cálculo puro, não autoria/renderização integral; referências a recursos dependem do catálogo seguro do lote 5. Esses itens continuam rastreados. Lote 4 (rig/IK/malha/morph/solo), lote 5 (recursos/tipografia/SVG/formats/scripts/render) e lote 6 (React Native/ecossistema/acervo) continuam obrigatórios. Não há homologação móvel, importação .riv, desempenho superior ao Rive ou full review final comprovados.

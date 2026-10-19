# Review incremental — lote 2: vetores, importação, workspace e aparência

Data: 18/10/2026. Branch: `feat/edisvg-evolution`; remoto consultado em `e15de57`. Este registro é intermediário, não o full review final nem conclusão dos lotes 2–6.

## Implementação

- Vértices múltiplos, suavização, separar/unir contornos e simplificação poligonal com tolerância local e limites explícitos. Edições passam pelo mesmo domínio UI/MCP; gestos continuam uma edição reversível.
- União, interseção, subtração e diferença simétrica com `polygon-clipping` 0.15.7 (MIT) e predicados robustos 3.0.3 (Unlicense). Preserva ID/transformação/aparência/animação do primeiro objeto; exige consentimento antes de remover os demais. Winding nonzero/evenodd, buracos, vazio, singularidade, bloqueios e contornos ambíguos são tratados explicitamente. Não expande strokes; curvas exigem conversão poligonal consentida, não promessa de equivalência exata de arcos.
- Cálculo em module Worker: um trabalho por vez, limite real de 10 segundos e cancelamento por término do Worker. Resposta revalidada, referências verificadas, sessão/projeto/revisão conferidos antes de publicar. MCP aguarda o resultado; não responde com uma Promise serializada.
- SVG entra em nova prancheta, nunca apagando animações/pranchetas anteriores. Relatório por elemento, sem importação parcial, com limite e contagem dos diagnósticos omitidos. Arquivo, colar e arrastar compartilham perfil seguro, limites de bytes e UTF-8 válido. CSS inline prevalece sobre atributos independentemente da ordem.
- Paleta de 64 cores e até 100 estilos por prancheta. Aplicar estilo copia valores; não cria vínculo implícito nem altera objetos ao excluir o preset. Seletor visual e amostragem com ação explícita/cancelamento, condicionada à API do Chromium. Nenhum pixel é coletado em segundo plano.
- Documento v8, migração v1–v7 e backup fiel; texto multilinha, família/peso/estilo/alinhamento/direção/espaçamento/altura de linha. Shaping/bidi são nativos SVG, com linhas completas e limite de expansão. Fontes locais ainda usam fallback da plataforma; isso não certifica portabilidade tipográfica.
- Paleta de comandos, menus de objeto/animação/exibição, contexto, painéis redimensionáveis por ponteiro/teclado e preferências separadas. Posicionamento dos divisores pertence ao grid CSS, sem máscara global de overflow.
- Suave usa Bézier real; representação copiável distingue CSS de parâmetros elásticos. Exportação JSON é o documento canônico reabrível, sem metadata SVG redundante potencialmente maior que o limite de entrada.

## Achados corrigidos

1. Importação anterior apagava todas as trilhas ao trocar uma cena: substituída por comando de nova prancheta atômico.
2. IDs sequenciais de importações diferentes colidiam: alocação de identidades únicas e validação global.
3. Respostas de Worker e UI de assistente precisavam preservar autorização temporal: validação de referências/revisão e `await` na execução.
4. Reverter topologia ou trocar contorno podia conservar seleção inválida de vértices: remapeamento/seleção de fallback explícitos.
5. Divisores posicionados em pixels ficavam atrasados na mudança de viewport: layout vinculado às trilhas CSS, sem ocultar o overflow.
6. Texto/estilo novos precisavam de formato e limites próprios: v8, contratos estritos, orçamento agregado de linhas/estilos e contabilização de expansão em componentes.
7. Campo multilinha tinha nome acessível contaminado pelo conteúdo: rótulo separado e nome explícito, verificado pela jornada de teclado/interface.
8. Instalação de dependências tentou re-resolver peers de autenticação sem relação com o editor: revertidas somente essas alterações; lockfile congelado aprovado.

## Evidências

- 117 testes do editor e 18 do núcleo passaram; sintaxe, tipos do editor e typecheck transversal (23 tarefas + tooling) aprovados.
- Build de produção passou. Jornada ampliada de navegador passou com importação/Undo, booleanas no Worker, cancelamento real por descarte do painel, paleta/estilos, texto multilinha/árabe e JSON canônico.
- Rodada completa de 4 E2E e repetição Electron do v8 passaram. Electron comprovou Worker sob `file://`/CSP sem alterar o projeto, Save/Open, cancelamento, recuperação, licença/expiração/IPC. Não é homologação dos lotes posteriores ou de amostragem por EyeDropper em todas as telas/dispositivos.
- Jornada Electron anterior comprovou Worker sob `file://` e CSP sem alterar o projeto aberto, além de Save/Open/cancelamento/recuperação/licença/expiração/IPC.
- Auditoria de produção: nenhuma vulnerabilidade conhecida. Nenhuma conta real, documento pessoal, instalação, publicação ou cobrança utilizada.

## Pendências rastreadas

M03/M04/M05 ainda incluem gradientes/efeitos, fontes portáteis, wrapping, texto em caminho/contorno e recursos SVG referenciados. Dependem do catálogo seguro de assets do lote 5; continuam obrigatórios, não suportados implicitamente pelos controles atuais. M01 ainda requer guias avançadas; M07 exige benchmarks/perfiling e atualização incremental mais ampla antes de superioridade de desempenho. Acervo real, DPI/dispositivos, React Native, estados/dados/layouts, rig/malha, formatos adicionais, scripting e colaboração continuam nos lotes seguintes. Não há equivalência `.riv` ou substituição integral certificada.

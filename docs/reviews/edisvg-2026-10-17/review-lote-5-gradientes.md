# Review incremental 5.5 — gradientes e importação SVG

18/10/2026. Continuidade do lote 5, sem encerrar M03/M05, lote 6 ou full review final.

## Contrato e integração

Documento v16/blueprint v4 acrescenta `gradients:{fill?,stroke?}` em formas, texto e grupos. Gradientes lineares/radiais têm coordenadas locais, units `objectBoundingBox`/`userSpaceOnUse`, spread `pad`/`reflect`/`repeat`, matriz affine opcional invertível e 2–32 paradas ordenadas com cor hexadecimal/opacidade. Posições iguais permitem corte de cor. Interpolação é sRGB. Há no máximo 256 definições distintas por documento/cena; bytes de pintura entram no orçamento agregado, e arrays são recusados por comprimento antes de validar seus elementos.

Definições usam SHA-256 do conteúdo normalizado, não o ID do objeto. Duas instâncias/versões de arte não compartilham acidentalmente uma definição com conteúdo diferente; pintura idêntica é deduplicada. Não se abre exceção para URLs livres em atributos. Núcleo gera definições/atributos e valida no runtime a correspondência de stops, geometria e referências, inclusive em componentes. Matriz possui contrato comum a playback/rig/gráficos, sem cópias divergentes do schema.

Herança de grupos respeita cores explícitas/`inherit` e pinturas locais. Reparenting materializa a aparência anterior quando necessário. Editar cor sólida remove somente o gradiente daquele canal; a mesma política atende interface, estilos e overrides compilados. O override de uma instância não modifica o componente de origem. Estilos preservam gradientes; MCP inspeciona cores/estilos por páginas e JSON exato, com prancheta/sessão/revisão.

Canvas, Testar, SVG/HTML e React consomem as mesmas definições. A interface edita tipo, coordenadas, spread, matriz, posição/cor/opacidade de stops, adição/remoção/reordenação, com histórico e locks. O README do ZIP React agora descreve os perfis efetivamente incorporados de PNG/fontes/áudio/nine-slice/gradientes e continua distinguindo cobertura de glifos e RN não homologado.

## Perfil de importação

DOMParser real transforma gradientes/refs locais em dados tipados, preservando grupos/herança e prioridade de estilo inline. Templates de mesmo tipo são resolvidos com detecção de ciclos e até oito níveis, incluindo referências já em cache. Atributos de coordenadas herdados permanecem distintos de defaults: alteração de centro radial calcula o foco padrão correto. Transformações, stops, alpha e avisos/erros não viram código de projeto.

Perfil atual: IDs ASCII locais até 120 caracteres, linear/radial estáticos, cores hex/RGB/RGBA numéricos ou nomes básicos, sRGB; porcentagens nas coordenadas de objectBoundingBox, absolutos para userSpaceOnUse. Defaults implícitos de userSpaceOnUse derivam do viewport. Templates cruzados de tipo, linearRGB importado, CSS externo/currentColor/variáveis, stop animado, URLs externas, referências ambíguas/divergentes, raios/vetores degenerados e defs ainda não suportados são recusados com relatório, sem publicar arte parcial. Um único stop é normalizado em dois stops da mesma cor, preservando a pintura constante. Clip/mask/symbol/pattern/filtros ainda não pertencem a esse perfil; não são ignorados silenciosamente.

## Review e evidências

- 143 testes do editor e 66 do núcleo aprovados; tipos editor/núcleo/tooling, build e check focado sem erros.
- Rodada conjunta de 38 E2E e Next.js produção/SSR/hidratação passou. Após ajustes documentais/MCP/estilo, sete jornadas focadas de gradientes/React/nine-slice/áudio foram repetidas; o novo importador com matriz também passou na repetição focada.
- Pixels reais de gradientes lineares/radiais comparados com os valores de referência; SVG original e normalizado concordaram nas amostras, incluindo herança, alpha, prioridade inline e focos de templates. Tolerância de um nível de canal cobre quantização de pixels, não geometria perdida.
- Runtime recusa stops alterados antes de adquirir o player e mantém o DOM intacto. Casos de ciclo, URL externa, ID ambíguo, template longo, opacidade inválida, animação/defs/unidades não suportados não publicam cena nem carregam rede externa.
- UI compilada comprova stops, recusa atômica de edição desordenada, undo/redo e recuperação; consumidor React ZIP independente compila/executa as definições sem workspace/rede. Capturas dos controles foram inspecionadas em `.cache/edisvg-review/gradient-authoring.png` e `gradient-stops.png`.
- Jornada Electron completa aprovada, incluindo pixels de gradientes e nine-slice sob file/CSP, PNG/fontes/PCM, rig/Worker/Yoga, integridade física/GUI/gerenciador, Save/Open/Cancel/recuperação/ZIP e licença/expiração/IPC. Ajustes posteriores de apresentação/MCP foram cobertos pelos gates focados, sem nova alegação de repetição nativa dessas telas. Não houve instalação/publicação de produto.

Achados corrigidos: pintura sólida/override mantendo gradiente sem efeito visível; possível mutação do master pelo compilador; gradiente herdado perdido no reparenting; defaults de foco/unidades aplicados cedo demais em templates; limite de cadeia burlado pelo cache; opacidade fora do perfil mascarada por alpha; validação de stops continuando após exceder orçamento (agora aborta antes de iterar); README exportado desatualizado; leituras de estilos indisponíveis ao MCP. A revisão de interface reutilizou grafite/menta, densidade/foco do editor e agrupamento compacto de stops, sem redesenhar a navegação existente ou substituir sua política de CSP por permissões de teste.

## Continuidade obrigatória

Próxima frente: clipping/máscaras, múltiplas pinturas/efeitos e demais recursos gráficos. Tipografia avançada, malha raster/triangulação, joystick/timeline, formatos adicionais, semântica/scripting, lote 6 e full review continuam obrigatórios. Sem equivalência `.riv`, superioridade de desempenho ou homologação React Native declaradas.

Referências primárias: [SVG 2 — paint servers](https://www.w3.org/TR/SVG2/pservers.html), [Zod — validação não continuável](https://github.com/colinhacks/zod/blob/main/packages/docs/content/api.mdx). APIs foram conferidas também no código da versão instalada.

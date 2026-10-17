# Etapa 01 — Inventário e baseline do EdiSVG

Data: 16/10/2026. Código: 0.5.4. Situação: **inventário e planejamento executados; etapa em validação, com homologação nativa pendente**.

## Resultado executivo

- Sintaxe aprovada; 59 testes aprovados, zero falhas, zero ignorados; build aprovado.
- Quatro pranchetas lidas via MCP. As duas Animar possuem as mesmas dimensões, regiões principais e textos funcionais. Referência principal adotada: `i0JJ4Q`.
- Interface aberta inspecionada por captura de leitura: apresenta versão **0.5.3**, não a 0.5.4 compilada nesta auditoria. A captura comprova somente o estado daquela instância.
- Edição vetorial e persistência têm implementação e testes. Timeline continua baseada em marcadores e movimentos globais predefinidos. Rig, composição aninhada e máquina editável permanecem ausentes.
- Automação do navegador falhou antes de conectar. Electron encerrou com código **-2147483645**, sem gerar `smoke-result.json`. A causa desse encerramento não foi determinada.
- Nenhum código funcional ou prancheta foi alterado. Foram produzidos documentos, fixtures e logs; o comando build atualizou `out/`.

## Evidências e alcance

| Evidência | Resultado | Limite |
| --- | --- | --- |
| [check.log](check.log) | Código de saída 0; sintaxe verificada | Não prova comportamento |
| [test.log](test.log) | Código de saída 0; 59/59 aprovados | Parte dos testes usa DOM e diálogos simulados |
| [build.log](build.log) | Código de saída 0; main, preload e renderer compilados | Não prova inicialização do Electron |
| [source-hashes.txt](source-hashes.txt) | SHA-256 dos módulos centrais | Identifica os arquivos auditados sem depender de commit |
| [pranchetas.txt](pranchetas.txt) | Textos das quatro pranchetas | Inventário textual complementado por inspeção visual e bounds |
| [execucao-nativa.md](execucao-nativa.md) | Tentativas e falhas registradas | Não houve homologação dos diálogos reais |
| Capturas pen.dev desta sessão | Duas telas Animar, máquina, exportação e navegador | Não constituem testes interativos nem comparação pixel a pixel |

Ambiente de execução: Windows/PowerShell, Node v24.15.0, npm 11.9.0. Manifesto declara Electron 44.7.2, electron-vite 6.0.0 e Vite 8.3.4. Sem instalação ou atualização de dependências nesta etapa.

## Referência visual e decisões adotadas

| ID | Decisão | Responsável | Situação |
| --- | --- | --- | --- |
| D01 | Animar usa `i0JJ4Q`; `zg8Qe` é referência equivalente auxiliar, não uma segunda implementação | Codex | Adotada para execução |
| D02 | Máquina usa `uHqQn`; exportação usa `gbxz9` | Codex | Adotada |
| D03 | Estado inicial continua Design e projeto vazio; Zezé será fixture de demonstração | Codex | Preserva comportamento atual |
| D04 | Campos e contagens vêm do documento; não fixar nomes Zezé, Corpo, Parado nem 3 animações/4 listeners em projetos livres | Codex | Requisito do backlog |
| D05 | Windows x64 é o alvo desktop inicial; editor completo avaliado em 1920×1080 e 1600×960, com verificação de usabilidade em 980×680 | Codex | Baseline proposta; tamanhos alinhados à referência/janela atual |
| D06 | Player: matriz proposta Chrome/Edge/Firefox desktop; Safari e toque dependem de ambiente disponível | Produto + Codex | Cobertura final a confirmar antes de E14 |
| D07 | Produto e aceite: Julio. Inventário, desenvolvimento e evidências: Codex por sessão | Codex | Arranjo operacional; sem pressupor equipe contratada |
| D08 | Capacidade semanal e datas não informadas; executar sequencialmente e estimar por incremento | Julio | Pendente de informação, não bloqueia E02.1 |
| D09 | 38 KB gzip/22 KB são valores ilustrativos; FPS 60 é alvo, não medição atual | Codex | Adotada |

Geometria de referência em 1920×1080: cabeçalho 52 px; área principal 678 px; ferramentas 56 px; hierarquia 280 px; inspetor 320 px; timeline 350 px, com cabeçalho 46 px. Máquina: painel esquerdo 300 px, grafo 1240 px e teste 380 px. Modal de exportação: 840×580, posição 540/150. Os tamanhos menores devem adaptar o conteúdo sem tornar ações essenciais inacessíveis.

Tokens extraídos: fundo `#0D0E11`, painel `#15171C`, painel secundário `#1C1F26`, borda `#262A33`, texto principal `#ECEEF2`, secundário `#9BA1AE`, terciário `#646A78`, destaque `#4FE3C1`, chaves `#FFB547`, ossos `#FF7AD9`, violeta `#9B7BFF`.

Checklist visual da referência: regiões principais sem colapso; alinhamento estrutural equivalente nas duas Animar; contraste de textos pequenos ainda exige medição. A inspeção de bounds sinalizou alças e onion skin parcialmente fora de contêineres nas telas Animar, além de arestas, pontos decorativos e mascote na máquina. Isso é uma indicação geométrica, não prova automática de defeito visual. Não replicar recortes cegamente; revisar durante implementação. Nenhuma correção foi aplicada ao design nesta auditoria.

Na captura da instância 0.5.3, são visíveis cabeçalho, ferramentas, hierarquia vazia, prancheta, inspetor e timeline global. O viewport é diferente da referência 1920×1080 e está em Design; portanto não se conclui equivalência visual da tela Animar a partir dessa captura.

## Matriz de requisitos

Legenda: **I** = implementação encontrada, sujeita à homologação indicada; **P** = parcial; **D** = demonstração/representação; **A** = ausente no caminho funcional auditado. Nenhum I significa automaticamente homologação nativa. Origem AN = ambas Animar; ME = máquina; EX = exportação; BASE = requisito operacional do plano.

Evidências abreviadas: APP = `src/renderer/src/app.js`; SC = `sceneEditor.js` e `src/shared/scene.js`; TO = `toolbar.js`/`canvasTools.js`/`penTool.js`; PA = `pathEditor.js`/`src/shared/pathGeometry.js`; PR = `src/shared/project.js`/`history.js`; FI = `src/main/projectFiles.js`/`index.js`; AM = `src/shared/animation.js`; EX = `src/renderer/src/export.js`; AI = `assistant.js`/`src/shared/aiTools.js`. Arquivos `.test.js` adjacentes sustentam os testes citados.

Responsável de execução de todas as linhas: Codex. Aceite de produto: Julio. Etapa indica o destino do trabalho; suas dependências estão no plano principal. Status é diagnóstico, não porcentagem de conclusão.

| ID | Origem | Requisito | Status / evidência atual | Etapa | Aceite específico |
| --- | --- | --- | --- | --- | --- |
| R001 | BASE/AN | Novo projeto | I · PR/FI; testes | 02 | Novo vazio, sem vínculo com arquivo anterior |
| R002 | BASE/AN | Abrir projeto | I · FI; diálogos simulados | 02 | Abrir v1/v2 pelo diálogo real sem perda |
| R003 | BASE/AN | Salvar/Salvar como | I · FI; testes de caminho/cancelamento | 02 | Gravar, reabrir e preservar destino ao cancelar |
| R004 | BASE/AN | Alterações pendentes e fechamento | P · controlador testado; janela pendente | 02 | Salvar/Descartar/Cancelar reais preservam escolha |
| R005 | BASE | Escrita atômica e falhas | I · teste real de arquivo + falha simulada | 02 | Erro mantém original e documento pendente |
| R006 | BASE/AN | Desfazer/refazer e atalhos | I · PR/APP; testes | 02 | Ação manual/IA e gesto completo reversíveis |
| R007 | BASE | Migração e recuperação | P · versões 1/2; início ignora cópia antiga | 02 | Política de recuperação explícita e migrações verificadas |
| R008 | AN | Menus Arquivo/Editar | P · arquivo real no desktop; undo/redo separados no cabeçalho | 03 | Comandos acessíveis e coerentes entre menus e atalhos |
| R009 | AN | Menus Objeto/Animação/Exibir | P · APP: aviso, play e prévia limpa | 03/06 | Menu apresenta operações efetivas pertinentes |
| R010 | AN | Ajuda | P · APP; texto contém limitações antigas | 03/18 | Ajuda descreve recursos e atalhos atuais |
| R011 | AN | Design/Animar | P · APP; edição de cena não traz inspetor animável | 05/06 | Modos preservam seleção e expõem operações adequadas |
| R012 | AN | Seleção e movimentação | I · TO/SC; seleção simples | 03 | Mover objeto sob zoom/grupo e cancelar gesto |
| R013 | AN | Seleção múltipla e agrupamento | A · SC tem grupos importados, sem operação de agrupar | 03 | Agrupar/desagrupar mantendo pose |
| R014 | AN | Caneta | I · TO; testes | 03 | Path aberto/fechado e Bézier persistem |
| R015 | AN | Formas | I · retângulo/círculo/linha | 03 | Criar, modificar e desfazer |
| R016 | AN | Texto | I · SC/TO; conteúdo e tamanho | 03 | Texto editável, seguro e persistente |
| R017 | AN | Vértices e alças | I · PA; testes geométricos/gestos | 03 | Editar tipos de vértice, inserir/remover e cancelar |
| R018 | AN | Pintura e contorno | P · cores sólidas/none; SC | 03 | Pintura preservada na importação e reabertura |
| R019 | AN | Mão/Zoom/Centralizar | I · TO; inspeção nativa pendente | 03 | Navegação não modifica dados da arte |
| R020 | AN | Hierarquia/renomear | I · SC; testes | 03 | Seleção e nome sincronizados com canvas |
| R021 | AN | Ocultar/bloquear | I · SC; herança testada | 03 | Grupo bloqueado protege descendentes |
| R022 | AN | Duplicar/excluir/ordem | I · SC; testes | 03 | IDs novos e ordem no grupo preservados |
| R023 | AN | Importar SVG | P · formas simples; parser XML real não homologado | 03 | Fixture importada e rejeição sem perda |
| R024 | AN | X/Y/rotação/opacidade/escala | I · SC para objeto, APP global na demo | 03/05 | Editar objeto e depois animar propriedades isoladamente |
| R025 | AN | Alças de escala/rotação e pivô | P · inspetor numérico; rig de seleção da demo | 03 | Manipulação direta com origem consistente |
| R026 | AN | Aba Artboards | D · APP mostra aviso | 04 | CRUD e troca de prancheta reais |
| R027 | AN | Aba Recursos | D · APP mostra aviso | 04 | Catálogo com uso e exclusão segura |
| R028 | AN | Balão/artboard aninhado | D · nome na hierarquia demonstrativa | 04 | Instância persistente, sem ciclos |
| R029 | AN | Criar/renomear animações | A · PR/AM restringem a três nomes | 05 | Dois nomes novos com trilhas independentes |
| R030 | AN | Duração e FPS | P · constantes; 60 FPS fixo | 05 | Configuração reflete régua e avaliação temporal |
| R031 | AN | Loop/ping-pong/uma vez | P · motor testado; exportador usa CSS fixo | 05/14 | Mesmos limites e modos no editor/player |
| R032 | AN | Transporte/timecode/playhead | I · APP para timeline global | 06 | Buscar, avançar e reproduzir em dados reais |
| R033 | AN | Trilhas por objeto/propriedade | A · linhas da demo/Marcadores globais | 05 | Braço e cabeça com valores independentes |
| R034 | AN | Chaves com valores | D · PR guarda números de quadros | 05 | Cada chave tem tempo, valor e alvo |
| R035 | AN | Mover/copiar/excluir chaves | A · APP adiciona marcador e busca quadro | 06 | Edição múltipla reversível |
| R036 | AN | Chave automática/diamantes | D · toggle e marcadores | 06 | Mudança grava apenas propriedade correta |
| R037 | AN | Linear/Suave/Elástico/Degrau | D · APP altera curva desenhada | 06 | Preset altera amostras do movimento |
| R038 | AN | Curva Bézier/cópia | D · representação textual/visual | 06 | Alças editáveis e expressão fiel |
| R039 | AN | Chaves/Curvas | D · alternância visual | 06 | Curva deriva das chaves selecionadas |
| R040 | AN | Zoom temporal/área de trabalho | A · régua não configurável | 06 | Navegar sem mudar duração inadvertidamente |
| R041 | AN | Onion skin | A · referência no design | 06 | Poses anteriores/posteriores calculadas |
| R042 | AN | Prévia limpa | P · demo oculta sobreposição | 06 | Funciona em cena própria sem alterar arte |
| R043 | AN | Criar/editar ossos | A · TO indisponível | 07 | Hierarquia real e pose de referência |
| R044 | AN | Mostrar ossos | D · APP SVG fixo | 07 | Sobreposição corresponde ao rig atual |
| R045 | AN | Vincular objetos aos ossos | A · sem entidade de rig | 07 | Membro acompanha cadeia salva |
| R046 | AN | IK/alvo/força | D · rótulo/overlay fixos | 08 | Alvo e influência 0/80/100% funcionam |
| R047 | AN | Restrição Distância | A | 08 | Distância aplicada e persistente |
| R048 | AN | Restrição Transformar | A | 08 | Copiar transformações com espaço definido |
| R049 | AN | Seguir caminho | A | 08 | Percurso e orientação reproduzíveis |
| R050 | AN | Malha/pesos/visualização | A · TO indisponível, tags na demo | 09 | Deformar e reabrir mantendo pesos |
| R051 | AN | Morph de vértices | D · trilha nominal; PA apenas geometria estática | 10 | Boca muda por chaves compatíveis |
| R052 | AN | Solo de expressões | D · linhas fixas | 10 | Filho ativo por chave discreta |
| R053 | AN/ME | Eventos/acenou | D · linha estática; log só transições | 10/13 | Evento temporal chega uma vez pela política definida |
| R054 | ME | Criar máquina/estados/grafo | D · APP grafo fixo | 11 | Criar máquina diferente sem código |
| R055 | ME | Entry | D · rótulo e início fixos | 11 | Estado inicial configurável |
| R056 | ME | Any State | A · só na prancheta | 11 | Transição global com prioridade definida |
| R057 | ME | Input booleano acenando | P · campo e comportamento predefinidos | 11 | Booleano nomeável em condição editável |
| R058 | ME | Input numérico humor | P · valor persistido sem blend | 11/12 | Número dirige interpolação de expressões |
| R059 | ME | Gatilho clicar | D · ação direta Pular | 11 | Trigger configurável e consumo determinístico |
| R060 | ME | Condições de transição | D · AM transições fixas | 11 | Editar condições e operadores |
| R061 | ME | Duração 200 ms/easing | D · texto sem blending | 11 | Mistura efetiva durante 200 ms |
| R062 | ME | Saída imediata/ao terminar | P · regras fixas do pulo | 11 | Política por transição |
| R063 | ME | Interromper | P · AM pulo não interrompível | 11 | Escolha editável respeitada |
| R064 | ME | Corpo/Rosto/Piscar | D · Rosto/Piscar rotulados referência | 12 | Execução simultânea por escopo |
| R065 | ME | Blend 1D Triste/Feliz | A · rótulo sem motor | 12 | Humor 0/0,5/1 produz mistura esperada |
| R066 | ME | Loop independente Piscar | A | 12 | Não reinicia ao mudar Corpo |
| R067 | ME | Listener entrar no Corpo | D · demo/predefinição | 13 | Alvo e ação configuráveis |
| R068 | ME | Listener sair do Corpo | D · demo/predefinição | 13 | Booleano muda no alvo correto |
| R069 | ME | Listener clique no Corpo | D · demo/predefinição | 13 | Dispara trigger configurado |
| R070 | ME | Mouse move/olhos seguem cursor | A | 13 | Coordenadas corretas sob transformação |
| R071 | AN/ME | View model número/bool/texto | P · dois inputs e nome do projeto; sem binding genérico | 13 | Dados tipados vinculados sem confundir nome do projeto |
| R072 | ME | Testar interação/estado ativo | D · APP bloqueia cena própria | 13 | Projeto novo testável, reset sem edição |
| R073 | ME | Log de eventos/transições | P · relógio local, até oito entradas | 13 | Tempo de execução e eventos reais |
| R074 | ME | Web component e API inputs/on | A | 14 | Carregar documento, mudar input e receber evento |
| R075 | EX | Pacote .edisvg + player JS | A | 14 | Pacote independente com recursos locais |
| R076 | EX | Componente React | A | 15 | Props/callbacks e desmontagem limpa |
| R077 | EX | HTML único | P · EX; teste de geração | 15 | Mesmo projeto/motor e abertura offline |
| R078 | EX | SVG animado CSS | P · EX; movimentos fixos | 16 | Timeline real, sem estados/JS |
| R079 | EX | Lottie JSON | A · JSON atual é projeto | 16 | Uma animação validada em player independente |
| R080 | EX | Máquina inicial | A | 15 | Seleção afeta inicialização |
| R081 | EX | Ajuste conter/proporção | P · SVG proporcional fixo, sem opção | 15 | Seleção aplica política de encaixe |
| R082 | EX | Reduzir movimento | P · CSS desativa animação; não escolhe Parado | 15 | Política de estado/fallback respeitada |
| R083 | EX | Pausar fora da tela | P · IntersectionObserver no HTML | 15 | Pausa/retomada coerente com relógio/eventos |
| R084 | EX | Texto alternativo | I · EX gera aria-label escapado | 15 | Texto acessível em cada formato aplicável |
| R085 | EX | Página de exemplo opcional | A | 15 | Incluir/excluir arquivo da distribuição |
| R086 | EX | Tamanho/resumo reais | D · APP contagens fixas; sem medição | 15 | Valores derivados da exportação |
| R087 | EX | Destino/exportar/cancelar/erros | P · FI/APP salvam arquivo, sem pacote | 15 | Cancelamento e falha não fingem sucesso |
| R088 | AN | Assistente | P · AI; oito ferramentas; testes de transporte | 17 | Tarefa real por provedor e undo verificável |
| R089 | BASE/AN | Atalhos/foco/acessibilidade | P · TO/PA com cobertura parcial | 03/18 | Fluxos principais por teclado, sem perda de foco |
| R090 | BASE | Desempenho/compatibilidade | A · sem baseline de runtime medido | 18 | Medições e limites documentados |

## Achados prioritários

Prioridades: P1 bloqueia confiança na validação ou contrato central; P2 precisa ser tratado no incremento pertinente; P3 acabamento/documentação. Não houve comprovação de perda real de dados nesta auditoria.

| ID | Prioridade | Achado/evidência | Ação e responsável |
| --- | --- | --- | --- |
| B01 | P1 | Browser mostra 0.5.3, manifesto/build 0.5.4 | Codex: validar nova instância identificada antes de homologar UI |
| B02 | P1 | Electron encerra -2147483645 sem relatório | Codex: diagnosticar inicialização em ambiente com execução nativa funcional |
| B03 | P1 | Smoke exige `.mascot`, mas inicialização chama `newProject()` e renderiza `.scene-artwork` | Codex: atualizar smoke para projeto vazio; achado estático, não erro observado nessa execução |
| B04 | P1 | Motor `poseAt` e CSS de exportação são implementações distintas; modos/durações fixos no CSS | Codex: contrato de avaliação compartilhado E05; equivalência E14 |
| B05 | P2 | Testar bloqueado para cena própria; grafo só demonstração | Codex: manter rotulagem honesta até E11–13 |
| B06 | P2 | Artboards/Recursos são avisos; menus Objeto/Animação não são menus completos | Codex: E03–04 |
| B07 | P2 | Ajuda diz que desenho não está disponível, embora haja ferramentas implementadas | Codex: corrigir documentação ao revisar E03 |
| B08 | P2 | Indicador de status exibe 60 fps fixo | Codex: separar FPS configurado de desempenho medido em E05/18 |
| B09 | P2 | Teste SVG usa parser simulado, sem ciclo completo do DOMParser real | Codex: validar importação no desktop com fixtures |
| B10 | P2 | README e lista antiga de etapas contêm status históricos contraditórios | Codex: usar esta matriz como baseline; atualizar README por incremento |
| B11 | P3 | Bounds do design apontam sobreposições/recortes | Codex: revisar visualmente no tamanho alvo, sem copiar defeitos |

## Projetos de referência

| Fixture | Uso | Situação |
| --- | --- | --- |
| `fixtures/01-formas-v2.edisvg` | Formas, grupo, transformações, histórico e persistência | Documento válido verificado pelo parser atual |
| `fixtures/02-importacao.svg` | Grupo, path, cores, texto e transformação herdada | Arte de teste preparada; importação XML real pendente |
| `fixtures/03-zeze-legado-v1.edisvg` | Compatibilidade v1 e movimentos globais legados | Válido; Zezé usa asset já incluído no app |
| `fixtures/04-multiplas-pranchetas.md` | Especificação de duas pranchetas e Balão aninhado | Cenário futuro; não fingir suporte v2 |
| `fixtures/05-zeze-completo.md` | Rig, malha, estados, listeners e exportação | Cenário futuro; implementação por marcos M3–M5 |

Zezé legado não é Zezé completo: o primeiro valida compatibilidade; o segundo será construído conforme os motores existirem.

## Orçamento de desempenho proposto

Ainda sem medição, portanto não é SLA aprovado: usar cenas de 100, 500 e 2.000 objetos (este último é o limite atual de validação), registrar hardware e resolução. Alvo de reprodução: 60 FPS, orçamento aproximado de 16,7 ms/quadro na cena representativa acordada. Alvo de resposta a comandos comuns: p95 abaixo de 100 ms. Carregamento e exportação devem registrar duração e memória antes de fixar limites. Confirmar os alvos após prova de viabilidade de rig/malha; não prometer 60 FPS para qualquer projeto.

## Próximo incremento pronto: E02.1 — contrato e fixtures de migração

Não iniciar animação livre alterando apenas o menu: o parser atual restringe nomes, durações e inputs. Primeiro estabelecer o contrato de documento.

| Tarefa | Dependência | Entrega | Aceite | Responsável |
| --- | --- | --- | --- | --- |
| E02.1-01 | R001–R007 | Especificar IDs, versão, separação documento/sessão e política de campos desconhecidos | Documento de contrato com exemplos v1/v2 e formato seguinte; sem descartar dados silenciosamente | Codex |
| E02.1-02 | E02.1-01 | Desenhar entidades de artboard, cena, animação e trilha; reservar contratos para rig/máquina | Referências, ownership e regras de exclusão explícitas; evitar implementação prematura dos motores | Codex |
| E02.1-03 | E02.1-01/02 | Especificar migração dos três movimentos predefinidos e marcadores antigos | Preservação da aparência ou limitação declarada; marcador não tratado como valor que nunca existiu | Codex |
| E02.1-04 | E02.1-03 | Casos verificáveis de round trip, IDs e referência inválida | Fixtures v1/v2 mantidas; teste negativo sem modificar documento atual | Codex |
| E02.1-05 | B01–B03 | Corrigir smoke obsoleto e repetir baseline da versão correta | Aplicativo inicia vazio; smoke alcança desenho/undo/redo; resultado nativo registrado | Codex |
| E02.1-06 | anteriores | Revisão do contrato e fatiamento E02.2 | Próximas alterações de parser/migração delimitadas com rollback e critérios claros | Codex + Julio |

E02.1 pode avançar documentalmente enquanto a homologação nativa é desbloqueada. E02 não deve ser marcada concluída sem resolver as pendências de arquivos/desktop. Datas ficam sem compromisso até capacidade e diagnóstico de B02 serem conhecidos.

## Fechamento de E01

- [x] Inventário rastreável com 90 requisitos, evidências, responsáveis e destino.
- [x] Baseline automatizada executada e logs guardados.
- [x] Referências visuais e política de consolidação definidas.
- [x] Fixtures atuais e cenários futuros separados.
- [x] Riscos, defeitos preexistentes e próximo incremento descritos.
- [ ] Homologação nativa de abrir/salvar/fechar/cancelar/undo/redo concluída.
- [ ] Versão 0.5.4 conferida em interface interativa, nas resoluções propostas.
- [ ] Capacidade semanal e cobertura final de plataformas confirmadas por Produto.

**Conclusão:** os entregáveis de inventário estão prontos. E01 permanece em validação pelos itens abertos acima; não há evidência suficiente para declarar homologação completa.

# Review para publicação do EdiFoto — 18/10/2026

O titular autorizou novo full review, correções, commit e publicação em produção/main. O trabalho foi isolado em `fix/edifoto-full-review`, partindo de `88c1163`, para preservar as alterações em andamento de EdiSVG/EdiPDF. Este registro complementa e atualiza o [review anterior](review-final.md); suas evidências anteriores continuam históricas.

## Correspondência com o diagnóstico

Os lotes cobriram correções e melhorias do diagnóstico, com o recorte de produto autorizado. Não representam implementação integral dos 58 itens da análise profissional original.

| Diagnóstico | Entrega no escopo simplificado |
| --- | --- |
| C01–C04, C15–C16 | Abertura protegida em todas as entradas, validação v1/v2, snapshot de pixels/modelo, savepoints, escrita ordenada e destino exato. |
| C05–C08, C11–C12 | Merge conservador, transformação afim, máscaras vinculadas, bloqueio, coleta/orçamentos e tratamento de GPU. |
| C09–C10, C18 | Transações síncronas, identidade de documento/sessão/run, cancelamento de ferramentas/processos e integração do job de IA com licença. Salvamento de recuperação conserva trabalho sob restrição. |
| C13–C14, C17 | Layout mínimo, harness/CI reparados, exemplos compatíveis com as ferramentas, recorte por cor explícito e intensidade identificada como multiplicador de opacidade. |
| M01–M02 | Espaço simples padrão, ferramentas adicionais acessíveis e mesclagem sob demanda; sem vários modos de trabalho. |
| M03–M04 | Expandir/recolher/suavizar seleção, máscara editável/vinculada e preservação do recorte existente; sem editor profissional de canais. |
| M05–M06 | Ferramentas existentes preservadas, com correções de geometria/segurança; motor de pincéis e curvas profissionais não foram ampliados. |
| M07–M10 | Autoajuste reutilizável, estilos/intensidade, quebra de texto, alinhamento e geometria fiel; sem runs tipográficos, warp ou snapping completo. |
| M11–M12 | Prévia/preferência de exportação e comparação com original preservado; sem exportação em pasta ou checkpoints nomeados. |
| M13–M14 | Assistente pessoal com contexto, progresso/cancelamento, undo e operações compartilhadas. Cobertura de alinhamento/estilos/seleção refinada; sem paridade universal do MCP com cada gesto manual. |
| M15–M16 | Orçamentos de memória/cache, recorte em worker, layout/foco/rótulos e documentação atualizada; sem benchmark universal nem novo sistema de onboarding. |
| N01, N06, N19, N21–N24 | Base de documento v2/recuperação, modelos/estilos e assistência local simplificados. A proposta de créditos/API da casa foi substituída pela exigência de assinatura pessoal. Demais sistemas especializados ficaram fora conforme o plano. |

O escopo vigente é o [plano simplificado](../../../apps/edifoto/PLANO-DE-IMPLEMENTACAO.md). Nomes da interface são genéricos. PSD/RAW, gestão profissional de cor, segmentação semântica, geração por API, tablet avançado e colaboração não são entregas deste ciclo.

## Achados adicionais corrigidos

| ID | Problema e causa | Correção e evidência |
| --- | --- | --- |
| R01 | Reabrir IDs persistidos reutilizava geração 1 de textura e podia mostrar pixels antigos. | Geração global monotônica; reabertura de arquivos com os mesmos IDs e pixels diferentes compara a saída GPU. |
| R02 | Troca limpava o registro antes de preparar todos os pixels e a imagem original. Falha podia deixar estado incompleto. | Registro preparado antes da troca, rollback em falha e original preparado antes de publicar o modelo; testes preservam modelo, histórico e registro. |
| R03 | Chunks não referenciados escapavam do orçamento de pixels; dimensões conflitantes/PNG só eram confrontadas após descompressão. | Rejeição de extras, validação de dimensões únicas, assinatura PNG/IHDR e dimensões esperadas antes da descompressão. Testes unitários e abertura inválida sem alterar workspace. |
| R04 | Pintura muda pixels antes do commit; outras operações/IA podiam intercalar e invalidar o undo. | Guarda central durante traço, incluindo troca/close/undo/redo/camada e IA; testes confirmam bloqueio e undo íntegro. |
| R05 | Gradientes recalculados nas novas dimensões mudavam aparência em corte/resize desigual. Giro de 180° fazia dois commits. | Referência afim persistida para gradientes e giro de 180° direto; testes de pixels para linear/radial, corte, resize, giro, flip e undo. |
| R06 | MCP continuava acumulando corpo após exceder limite; aceitava prefixos de rota. Chaves herdadas podiam ser tratadas como ferramentas. | Limite por bytes com descarte imediato, JSON/aborto tratados, rota exata e Object.hasOwn. Servidor HTTP real nos testes. |
| R07 | Timeout não avisava renderer; saída tardia de processo parado podia recriar sessão. | Timeout propaga cancelamento e processos parados deixam de alimentar sessões/eventos. |
| R08 | Exportação rápida podia usar outro documento após o diálogo. Confirmação de descarte podia ficar obsoleta. | Identidade de workspace conferida antes da saída e edição conferida após confirmação; teste de troca durante picker. |
| R09 | Falha de Blob.arrayBuffer não rejeitava encoder; falhas de recipe deixavam alocações órfãs. | Propagação de rejeição e coleta de bitmaps após falha. |
| R10 | Mensagem residual “Voc?”; controles de ícone/campo do assistente sem rótulos explícitos e foco pouco visível em campos. | Texto corrigido, rótulos/foco e respeito a movimento reduzido. Revisão baseada nas [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). |

## Verificação deste checkout

- `pnpm install --frozen-lockfile`, Node 24.15.0/pnpm 9.15.0; sem atualização de dependências.
- `pnpm check`: sem erros; avisos existentes permanecem visíveis.
- `pnpm typecheck` e `pnpm test`: passaram no monorepo, incluindo tooling Edi.
- EdiFoto: **36 testes unitários e 174 verificações de navegador**, sem falhas/erros JavaScript. Verificações novas exercitam operações reais do editor/GPU; arquivos/provedores do harness são fixtures.
- `pnpm edi:test:native edifoto`: passou no checkout isolado; recompila o aplicativo e exercita diálogos Windows de salvar/abrir/cancelar, recuperação, exportação PNG, integridade/GUI/licença offline/expiração/IPC.
- `pnpm audit --prod --json`: zero vulnerabilidades reportadas.
- Portal de produção: `/api/ready` respondeu 200 com migrations esperadas/aplicadas iguais. Ambiente GitHub `edi-release`, nomes de secrets/variáveis e política para `main`/`edi-v*` conferidos sem expor valores.
- Inspeção visual: 1440×900 e 1100×680, dock e painéis dentro da área. Capturas/logs locais em `.cache/edifoto-tests` e `.cache/*review*`.

Uma tentativa nativa inicial falhou no fixture de instalação/limpeza, antes de iniciar a jornada editorial; o agregado não expunha suas causas. O runner passou a registrar cada causa agregada, e a execução seguinte completa passou. A falha inicial não foi contada como sucesso. O primeiro teste HTTP também revelou sintaxe TypeScript não suportada pelo strip-only do Node; a declaração foi corrigida e os testes passaram sem trocar o runner.

Sem chamada ao provedor pessoal, cobrança ou uso de conteúdo pessoal/produção nos testes. Quota/login/respostas reais dependem do cliente e da conta do usuário. Estes gates não comprovam facilidade para todo usuário nem qualidade em todos os fundos/GPU; a avaliação com usuários/hardware representativos continua como validação de produto.

## Publicação

A integração na `main` e a release desktop `edi-v0.1.2` seguem os gates remotos. O EdiFoto não é serviço Railway; seus instaladores são publicados pelo workflow da suíte no repositório público de distribuição. Os demais apps são reconstruídos a partir de main pelo catálogo existente, sem incluir as frentes locais não revisadas. O resultado remoto será registrado após confirmação.

# Review intermediário — lote 1

Data: 17/10/2026. Branch `feat/edisvg-evolution`, base `b37105a`. Este review cobre documento/comandos/trilhas e runtime SVG; não é o full review final dos lotes 0–6, nem homologação comercial.

## Entrega e contratos

- Documento v3 tipado, identidade estável, validação estrita de capacidades conhecidas e migração de v1/v2. Backup byte a byte antes da primeira substituição de arquivo antigo, incluindo BOM/CRLF; falha do backup preserva o original. Detecção otimista de mudanças externas antes do salvamento, não uma trava distribuída/CAS de filesystem.
- `@informach/edi-motion` como fonte única de avaliação, comandos e regras de trilhas. Animações livres com FPS/duração/modo, seis propriedades por objeto, easing linear/hold/Bézier cúbica; orçamento agregado antes de clonagem profunda e limite de arquivo compartilhado de 8 MB.
- Interface preservada: criar/configurar/excluir animações, gravar poses, autochave, trilhas/valores reais, navegar/excluir chaves, reproduzir e desfazer/refazer. Presets globais e seus marcadores ficam separados como legado. Gráfico de curvas/interpolação visual ainda pertence ao lote 2.
- Transação compartilhada entre UI de objetos/trilhas e MCP, condicionada a projeto/sessão/revisão; falha ou pedido obsoleto não publica mudanças. Exclusão de objeto remove referências no mesmo passo reversível; bloqueio herdado impede autoria de chaves. Ferramentas antigas de desenho/vértices continuam com commits validados no histórico existente.
- Inspeção MCP paginada de objetos, atributos, animações e chaves; resumo não despeja o documento inteiro em contexto. Autenticação, licença, origem e limites do SDK continuam exigidos. Não foi feita chamada a IA paga ou teste com contas reais.
- ESM/IIFE da mesma entrada de runtime, incorporado no HTML independente. Play/pause/seek/troca/destroy, movimento reduzido, offscreen e documento oculto. A integração não depende do editor ou de licença para reproduzir conteúdo exportado. SVG é conversão amostrada declarada, com orçamento próprio e camada estática inicial para movimento reduzido.
- Histórico mantém contexto de navegação e limita snapshots por quantidade e tamanho serializado. Esse orçamento de 32 MB não promete teto exato do heap; patches incrementais/virtualização continuam oportunidades do lote 2.

## Achados corrigidos

1. Main Electron externalizava o novo package TS: build e navegador passavam, mas o app exibia `ERR_MODULE_NOT_FOUND`. Extensão explícita `bundledPackages` do SDK incorpora o motor somente no consumidor SVG; teste de contrato preserva os defaults dos demais apps.
2. Campos futuros no documento/cena/inputs podiam ser ignorados durante normalização: v3 agora recusa conteúdo desconhecido, preservando a cópia incompatível. Legados têm migração explícita.
3. Deletar objetos animados poderia produzir referências órfãs: remoção de trilhas participa da mesma transação e do undo.
4. Navegação podia entrar no histórico: snapshots canônicos separam seleção de conteúdo e undo mantém o modo/clip/quadro quando possível.
5. `seek` inválido podia deixar o tempo do player contaminado: validação antecede publicação do valor. Troca de clip restaura canais da transformação-base.
6. Exportação por objeto não carregava a transformação global quando o SVG não tinha wrapper de movimento: runtime e editor agora compartilham o mesmo espaço/wrapper; teste de exportação conserva esses ajustes.
7. Atributos booleanos de conveniência HTML na alternativa estática eram XML inválido em arquivo SVG: valores explícitos e teste com DOMParser `image/svg+xml`, além da execução SMIL real.
8. Limite só por número de snapshots permitia crescimento excessivo: orçamento serializado adicional e descarte informado de entradas antigas, sem apagar o documento atual.
9. Escalas positivas de legados abaixo de 0,01 não eram animáveis: perfil de transformação por objeto e motor foram alinhados; transformação global legada conserva seu próprio contrato.
10. Novo teste TS de exportação não entrava no glob do runner: manifesto atualizado para incluir testes TS do renderer. Teste anterior de exportação deixou de substituir globals de fetch/DOM/URL/timers; geração pura é testada diretamente, transporte/download pelo browser real.

O teste compartilhado de vault usa lock real com até 30 tentativas de até 1 s. A deadline padrão de 5 s podia abortar contenção válida entre seis clientes; deadline específica de 40 s cobre o protocolo e limpeza, sem alterar retries, mockar locks ou mudar produção. Houve também uma falha inicial do launcher GUI isolado que não se reproduziu no diagnóstico separado nem nas execuções subsequentes; não foi “corrigida” por suposição ou ocultada.

## Evidências locais

- 81 testes do app, 5 do motor e 51 do SDK; tipos dos três e sintaxe do app aprovados.
- 3 E2E em Edge/Chromium, com perfis descartáveis: autoria de dois objetos, poses independentes, undo/redo, recuperação, download/execução offline do HTML e SVG; XML real e matrizes SMIL no tempo esperado; player ESM real, canais restaurados, tempo inválido, one-shot, movimento reduzido, pausa e destroy.
- Build do app aprovado; revisão da captura `.cache/edisvg-lote1.png` confirmou integração visual com a interface existente. Não é um golden test visual automatizado.
- Typecheck transversal: 23 tarefas aprovadas; auditoria de produção: nenhuma vulnerabilidade conhecida reportada. Não equivale a prova de ausência de falhas.
- Runner Electron real aprovado após a correção do bundle e repetido sobre a última revisão: integridade, launcher, gate, lease assinada descartável, Save/Open, cancelamento de Save As, recuperação destacada, expiração e recusa IPC. Não foi instalado ou publicado nenhum instalador.
- `pnpm check` passou sem erros, mantendo 431 warnings e 65 infos visíveis; `pnpm edi:typecheck:tooling` passou. Não houve supressão dos diagnósticos legados.

## Limites e continuidade

Lote 1 fechado localmente; próximo incremento é autoria de chaves/curvas do lote 2. O motor não entrega ainda artboards/componentes, rig/IK/malha/morph, estados/bindings/layout, assets avançados, scripting, colaboração, React ou React Native. A matriz confirmada é web/React e React Native, com autoria inicial Windows; isso não certifica iOS/Android ou outros navegadores. Nenhuma promessa de compatibilidade `.riv`, substituição completa do Rive ou superioridade de desempenho foi feita. Não houve commit, merge, push, instalador publicado, deploy, configuração comercial ou operação de produção nesta execução.

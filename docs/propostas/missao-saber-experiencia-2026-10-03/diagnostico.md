# Registro da análise de experiência

Base: `c7b22d53327180692f432ed9185ac46140d6e4f0`, 3 de outubro de 2026. Leitura complementar da [proposta](proposta.md).

## Evidências verificáveis

| ID | Observação | Evidência no código / percurso | Interpretação e limite |
| --- | --- | --- | --- |
| UX-01 | O destino após autenticação é sempre Família. | [`auth-form.tsx`](../../../apps/missao-saber/src/components/auth-form.tsx), função `navigate`, linha 40. Reproduzido após confirmar a conta fictícia. | Não distingue a intenção de acompanhar da intenção de estudar. Não significa que não exista página inicial do estudante. |
| UX-02 | Menu de estudo na área familiar; acesso à família por ícone. | [`layout.tsx`](../../../apps/missao-saber/src/app/(app)/layout.tsx), seletor e link `Área da família`, linhas 57–74; [`navigation.tsx`](../../../apps/missao-saber/src/components/navigation.tsx). Reproduzido no computador e celular. | O link tem nome acessível, mas não rótulo textual visível. É problema de descoberta e contexto, não ausência de nome para leitor de tela. |
| UX-03 | Criar perfil muda diretamente para Hoje. | [`family-controls.tsx`](../../../apps/missao-saber/src/features/family/components/family-controls.tsx), linha 209. Reproduzido com Lua, 6º ano, OLITEF N1. | A saudação passa a falar com Lua sem uma etapa explícita de passagem do aparelho. |
| UX-04 | Perfis, relatórios e administração compartilham uma página extensa. | [`familia/page.tsx`](../../../apps/missao-saber/src/app/(app)/familia/page.tsx), seções de estudantes (205), relatos (270), plano (495) e dados (636). | A altura observada foi 4.244 px para janela de 390 × 844, com um perfil sem atividade. Outros planos e históricos alteram o tamanho. Não é medida de abandono. |
| UX-05 | O cartão do perfil remete ao seletor de estudante. | Mesma página, seção de estudantes: “Progresso separado e acessível pelo seletor de estudante.” | Uma ação “Abrir estudo de Lua” permitiria executar a tarefa no próprio contexto. |
| UX-06 | A página Hoje já oferece recomendação com destaque. | [`hoje/page.tsx`](../../../apps/missao-saber/src/app/(app)/hoje/page.tsx), cartão da missão e botão na linha 185; [`recommendation.ts`](../../../apps/missao-saber/src/features/learning/recommendation.ts). | O botão estava visível na primeira tela móvel. Preservar o motor e o destaque; corrigir a chegada e as opções secundárias. |
| UX-07 | Diagnóstico aparece como outro ponto de partida, abaixo de métricas. | Hoje, linha 260: “Encontre seu ponto de partida”; três métricas de prática/autonomia/ajuda antes dos cartões secundários. | O significado da escolha entre missão e diagnóstico não fica suficientemente explícito. Isso é avaliação heurística, não resultado de teste com alunos. |
| UX-08 | Preferência diária é mostrada como duração aproximada da atividade. | Hoje, linha 190: `data.family?.dailyMinutes ?? 10`. | Dado de rotina não estima duração específica de missão. Proposta: distinguir combinado e estimativa. |
| UX-09 | A chamada geral do laboratório ficou estreita em relação ao catálogo. | Hoje, linha 292: “Porcentagens, malhas e grupos”. Biblioteca e runtime já incluem outras famílias e modos. | Corrigir a descoberta da capacidade existente, sem nova expansão curricular. |
| UX-10 | O texto da revisão expõe regras de evidência ao estudante. | [`revisao/page.tsx`](../../../apps/missao-saber/src/app/(app)/revisao/page.tsx), linha 94: estratégias distintas, primeiro acerto e pistas. | A regra tem valor pedagógico e deve continuar; sua explicação pode ficar em detalhe, com resumo claro na ação principal. |
| UX-11 | Apresentação comum a diferentes faixas. | [`globals.css`](../../../apps/missao-saber/src/app/globals.css), layout e componentes compartilhados; apresentação da conclusão em [`player.tsx`](../../../apps/missao-saber/src/features/learning/components/player.tsx). | Possível inadequação do tom para adolescentes é hipótese apoiada em referências externas, não rejeição observada em usuários do app. |
| UX-12 | Conta familiar e perfil selecionado não constituem dois papéis autenticados. | [`view.ts`](../../../apps/missao-saber/src/lib/view.ts), [`action.ts`](../../../apps/missao-saber/src/lib/action.ts), [`family/actions.ts`](../../../apps/missao-saber/src/features/family/actions.ts). Rotina, desafio e preferência de e-mail usam usuário verificado; cobrança usa `recentParent`. | A confirmação recente de algumas operações não define uma sessão restrita de estudante. Não foi demonstrado acesso indevido entre famílias. |
| UX-13 | O fechamento da missão já existe. | [`player.tsx`](../../../apps/missao-saber/src/features/learning/components/player.tsx), seção de conclusão: voltar ao dia, registrar e próximo passo opcional. | A proposta torna o encerramento diário mais explícito e reduz decisões; não parte da premissa de ausência de fechamento. |
| UX-14 | Sugestões familiares aparecem antes de haver tentativas. | Relatório local de Lua: orientação inicial ligada à trilha, zero tentativas, próximo assunto e lista de não estudados. | É útil oferecer apoio inicial, desde que fique claro que a sugestão vem da trilha e ainda não de observações daquele estudante. |

## Percurso reproduzido

1. Página de entrada pública em produção, somente leitura.
2. Página de entrada local; criação de conta fictícia do responsável e confirmação com e-mail gravado no ambiente local.
3. Família sem perfis: menu com sete destinos de estudante no computador; formulário, planos e privacidade na mesma página.
4. Criação de Lua, 6º ano, trilha OLITEF N1. Redirecionamento direto para Hoje.
5. Hoje: missão “O tamanho de uma parte”, ação “Começar descoberta”, três contadores zerados, diagnóstico, laboratório e caderno.
6. Janela de 390 × 844: botão principal visível, largura do documento de 390 px, sem rolagem horizontal no estado observado.
7. Retorno por “Área da família”: acompanhamento inicial, rotina, planos e dados, mantendo as cinco abas móveis de estudo.

As capturas representam ambiente de desenvolvimento com dados fictícios; indicadores do Next.js não fazem parte da interface de produção.

- [Família antes do primeiro perfil — computador](evidencias/familia-primeiro-acesso.png).
- [Hoje no primeiro estudo — celular](evidencias/hoje-primeiro-estudo.png).
- [Família com um perfil sem atividade — celular](evidencias/familia-celular.png).

## Limites e cobertura futura

Esta foi uma avaliação de arquitetura de experiência e inspeção funcional dirigida. Não substitui auditoria completa de acessibilidade, teste de penetração, avaliação de aprendizagem ou pesquisa com usuários. Estados pagos, múltiplos estudantes e adolescentes foram examinados por código e desenho de fluxo, sem reprodução integral em navegador nesta rodada. Não se coletaram dados reais de famílias nem se usaram cookies do Brilliant nesta análise.

Antes da implementação, validar a organização da navegação, as faixas de apresentação, as expectativas sobre acompanhamento de adolescentes e o uso de aparelhos compartilhados. Durante a implementação, testar links diretos, autorização de estudante, expiração, troca de perfil, revogação, falhas de rede, rascunhos e equivalência dos relatórios.

## Verificação dos materiais da proposta

O conceito foi percorrido em navegador: três etapas de preparação, passagem para estudo, abertura da prévia de missão, conclusão, encerramento e retorno por cenário. Foram conferidos os cinco cenários em janela de 320 px, sem transbordamento horizontal, e capturadas versões de computador e celular. A conclusão mantém a identidade do adolescente; diálogos fecham por Escape. A rodada final não registrou erros de execução JavaScript. Também foram verificados sintaxe do script e destinos locais dos links dos documentos. Isso verifica o artefato demonstrativo, não comprova sua usabilidade com famílias nem substitui os testes da futura implementação.
